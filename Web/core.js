import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import tasks from 'markdown-it-task-lists';
import deflist from 'markdown-it-deflist';
import Slugger from 'github-slugger';
import katex from 'katex';
import Token from 'markdown-it/lib/token.mjs';

export const profiles = Object.freeze({
  commonmark: { name: 'CommonMark', tables: false, tasks: false, strike: false, math: false },
  github: { name: 'GitHub', tables: true, tasks: true, strike: true, math: false },
  gitlab: { name: 'GitLab', tables: true, tasks: true, strike: true, math: true }
});
export const validDialect = value => Object.hasOwn(profiles, value);
export const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const lineOffsets = source => {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  return starts;
};
export const newlineOf = source => source.includes('\r\n') ? '\r\n' : '\n';
export function sourceOffset(source, textareaOffset) {
  let normal = 0, raw = 0;
  while (raw < source.length && normal < textareaOffset) {
    if (source[raw] === '\r' && source[raw+1] === '\n') raw++;
    raw++; normal++;
  }
  return raw;
}
export function textareaOffset(source, rawOffset) {
  return source.slice(0,rawOffset).replace(/\r\n/g,'\n').length;
}
export function sourceInput(source, normalized) {
  const before=source.replace(/\r\n/g,'\n');
  let start=0;
  while(start<before.length && start<normalized.length && before[start]===normalized[start]) start++;
  let oldEnd=before.length,newEnd=normalized.length;
  while(oldEnd>start && newEnd>start && before[oldEnd-1]===normalized[newEnd-1]) {oldEnd--;newEnd--;}
  return patch(source,sourceOffset(source,start),sourceOffset(source,oldEnd),
    normalized.slice(start,newEnd).replace(/\n/g,newlineOf(source)));
}

function gitlabExtensions(md) {
  md.use(footnote).use(deflist);
  md.inline.ruler.before('emphasis', 'inline_diff', (state, silent) => {
    const start = state.pos;
    const marker = state.src.slice(start, start + 2);
    if (!['{+','{-','[+','[-'].includes(marker)) return false;
    const end = state.src.indexOf(marker[1] + (marker[0] === '{' ? '}' : ']'), start + 2);
    if (end < 0) return false;
    if (!silent) {
      const token = state.push('inline_diff', '', 0);
      token.content = state.src.slice(start + 2, end);
      token.meta = { tag: marker[1] === '+' ? 'ins' : 'del' };
    }
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.inline_diff = (tokens, i) =>
    `<${tokens[i].meta.tag}>${escapeHTML(tokens[i].content)}</${tokens[i].meta.tag}>`;
  md.inline.ruler.before('escape', 'math_inline', (state, silent) => {
    const start = state.pos;
    if (state.src[start] !== '$') return false;
    const display=state.src[start+1]==='$',backticks=state.src[start+1]==='`';
    if(display || backticks) {
      const closer=display ? '$$' : '`$';
      const end=state.src.indexOf(closer,start+2);
      if(end<0) return false;
      if(!silent) state.push(display ? 'math_display' : 'math_inline','',0).content=state.src.slice(start+2,end);
      state.pos=end+2;return true;
    }
    if (/\s/.test(state.src[start + 1] || ' ')) return false;
    let end = start + 1;
    while ((end = state.src.indexOf('$', end)) >= 0 && state.src[end - 1] === '\\') end++;
    if (end < 0 || /\s/.test(state.src[end - 1])) return false;
    if (!silent) state.push('math_inline', '', 0).content = state.src.slice(start + 1, end);
    state.pos = end + 1;
    return true;
  });
  md.renderer.rules.math_inline = (tokens, i) => katex.renderToString(tokens[i].content,
    { throwOnError: false, trust: false, strict: 'ignore' });
  md.renderer.rules.math_display = (tokens,i) => katex.renderToString(tokens[i].content,
    {displayMode:true,throwOnError:false,trust:false});
  md.block.ruler.before('fence', 'math_block', (state, start, end, silent) => {
    const first = state.src.slice(state.bMarks[start], state.eMarks[start]).trim();
    if (first !== '$$') return false;
    let last = start + 1;
    while (last < end && state.src.slice(state.bMarks[last], state.eMarks[last]).trim() !== '$$') last++;
    if (last >= end) return false;
    if (silent) return true;
    const token = state.push('math_block', '', 0);
    token.map = [start, last + 1];
    token.content = state.getLines(start + 1, last, 0, false);
    state.line = last + 1;
    return true;
  });
  md.renderer.rules.math_block = (tokens, i) => '<div class="math-block">' +
    katex.renderToString(tokens[i].content, { displayMode: true, throwOnError: false, trust: false }) + '</div>\n';
  md.block.ruler.before('blockquote', 'multiline_quote', (state, start, end, silent) => {
    const opening=state.src.slice(state.bMarks[start], state.eMarks[start]).trim().match(/^>>>(?:\s+(.*))?$/);
    if (!opening) return false;
    let last = start + 1;
    while (last < end && state.src.slice(state.bMarks[last], state.eMarks[last]).trim() !== '>>>') last++;
    if (last >= end) return false;
    if (silent) return true;
    const token = state.push('multiline_quote', '', 0);
    token.content = (opening[1] ? opening[1]+'\n' : '') + state.getLines(start + 1, last, 0, false);
    token.map = [start, last + 1];
    state.line = last + 1;
    return true;
  });
  md.renderer.rules.multiline_quote = (tokens, i) => {
    const content=tokens[i].content;
    const alert=content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]([^\n]*)\n?/i);
    if(!alert) return '<blockquote>' + md.render(content) + '</blockquote>\n';
    const type=alert[1].toLowerCase(),title=alert[2].trim() || type[0].toUpperCase()+type.slice(1);
    return `<blockquote class="alert alert-${type}"><p><strong>${escapeHTML(title)}</strong></p>${md.render(content.slice(alert[0].length))}</blockquote>\n`;
  };
}

function parser(dialect) {
  if (!validDialect(dialect)) throw new Error(`Unknown Markdown flavour: ${dialect}`);
  const md = new MarkdownIt(dialect === 'commonmark' ? 'commonmark' : 'default',
    { html: true, linkify: dialect !== 'commonmark', breaks: false, typographer: false });
  if (dialect !== 'commonmark') md.use(tasks, { enabled: true, label: true });
  if (dialect === 'gitlab') gitlabExtensions(md);
  md.block.ruler.before('hr', 'front_matter', (state, start, end, silent) => {
    if (dialect === 'commonmark' || start !== 0 || state.src.slice(0, state.eMarks[0]).trim() !== '---') return false;
    let last = 1;
    while (last < end && !/^(---|\.\.\.)$/.test(state.src.slice(state.bMarks[last], state.eMarks[last]).trim())) last++;
    if (last >= end) return false;
    if (silent) return true;
    const token = state.push('front_matter', '', 0);
    token.content = state.getLines(0, last + 1, 0, false);
    token.map = [0, last + 1];
    state.line = last + 1;
    return true;
  });
  md.renderer.rules.front_matter = () => '';
  md.renderer.rules.blockquote_open = (tokens,index,options,env,self) => {
    const tag=self.renderToken(tokens,index,options);
    return tokens[index+1]?.type === 'blockquote_close' && !tag.endsWith('\n') ? tag+'\n' : tag;
  };
  return md;
}

export function render(source, dialect = 'gitlab', { mapped = true } = {}) {
  const md = parser(dialect);
  const env = {};
  const tokens = md.parse(source, env);
  const offsets = lineOffsets(source);
  const slugger = new Slugger();
  const headings = [], blocks = [], tables = [], links = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.map) {
      const [first, last] = token.map;
      const start = offsets[first] ?? source.length;
      const end = offsets[last] ?? source.length;
      if (token.nesting === 1 || token.nesting === 0) {
        const type = token.type.replace(/_open$/, '');
        const block = { type, start, end, line: first + 1, tokenIndex: i,info:token.info || '',
          editable: ['paragraph', 'heading'].includes(type) && token.level === 0 };
        blocks.push(block);
        if (mapped && token.nesting === 1) {
          token.attrSet('data-start', String(start));
          token.attrSet('data-end', String(end));
          token.attrSet('data-kind', type);
          token.attrSet('data-editable', String(block.editable));
        }
        if (type === 'table') tables.push({ start, end, line: first + 1 });
      }
    }
    if (token.type === 'heading_open') {
      const inline = tokens[i + 1];
      const text = (inline.children || []).filter(t => t.type !== 'html_inline')
        .map(t => t.content || '').join('');
      const id = slugger.slug(text);
      token.attrSet('id', id);
      headings.push({ level: Number(token.tag.slice(1)), text, id,
        start: offsets[token.map[0]], line: token.map[0] + 1 });
    }
    if (token.type === 'inline') {
      if (dialect === 'gitlab' && /^(?:\[\[_?TOC_?\]\]|\[TOC\])$/i.test(token.content.trim())) {
        const toc = new Token('toc', '', 0);
        toc.meta={start:offsets[token.map[0]],end:offsets[token.map[1]] ?? source.length};
        token.children = [toc];
        if(tokens[i-1]?.type==='paragraph_open') tokens[i-1].hidden=true;
        if(tokens[i+1]?.type==='paragraph_close') tokens[i+1].hidden=true;
      }
      for (const child of token.children || []) {
        if (child.type === 'link_open') links.push({ href: child.attrGet('href'), line: (token.map?.[0] ?? 0) + 1 });
        if (child.type === 'image') links.push({ href: child.attrGet('src'), image: true, line: (token.map?.[0] ?? 0) + 1 });
      }
    }
    if (dialect !== 'commonmark' && token.type === 'blockquote_open') {
      const inline = tokens[i + 2];
      const match = inline?.content?.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]([^\n]*)\n?/i);
      if (match) {
        token.attrSet('class', 'alert alert-' + match[1].toLowerCase());
        inline.content = inline.content.slice(match[0].length);
        inline.children = md.parseInline(inline.content, {})[0].children;
        const title=match[2].trim() || match[1][0].toUpperCase()+match[1].slice(1).toLowerCase();
        const header=new Token('html_inline','',0);header.content=`<strong class="alert-title">${escapeHTML(title)}</strong><br>`;
        inline.children.unshift(header);
      }
    }
  }
  const originalFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (ts, i, options, env, self) => {
    const t = ts[i], language = t.info.trim().split(/\s/)[0];
    const start = offsets[t.map[0]] ?? 0;
    const attrs = mapped ? ` data-start="${start}" data-end="${offsets[t.map[1]] ?? source.length}" data-kind="fence"` : '';
    if (dialect === 'gitlab' && language === 'mermaid') return `<div class="diagram"${attrs}><pre class="mermaid">${escapeHTML(t.content)}</pre></div>\n`;
    if (dialect === 'gitlab' && ['math', 'latex'].includes(language)) return `<div${attrs}>${katex.renderToString(t.content, { displayMode: true, throwOnError: false, trust: false })}</div>\n`;
    return `<div${attrs}>${originalFence(ts, i, options, env, self)}</div>`;
  };
  md.renderer.rules.html_block = (ts,i) => {
    if (!mapped) return ts[i].content;
    const t=ts[i];
    return `<div data-start="${offsets[t.map[0]]}" data-end="${offsets[t.map[1]] ?? source.length}" data-kind="html_block">${t.content}</div>`;
  };
  md.renderer.rules.toc = (ts,i) => '<nav class="toc" aria-label="Table of contents"' +
    (mapped ? ` data-start="${ts[i].meta.start}" data-end="${ts[i].meta.end}" data-kind="toc"` : '') + '>' + headings.map(h =>
    `<a style="margin-left:${(h.level - 1) * 12}px" href="#${escapeHTML(h.id)}">${escapeHTML(h.text)}</a>`).join('') + '</nav>';
  let html = md.renderer.render(tokens, md.options, env);
  if (dialect === 'gitlab') {
    const toc = '<nav class="toc" aria-label="Table of contents">' + headings.map(h =>
      `<a style="margin-left:${(h.level - 1) * 12}px" href="#${escapeHTML(h.id)}">${escapeHTML(h.text)}</a>`).join('') + '</nav>';
    html = html.replace(/<p([^>]*)>\[\[_?TOC_?\]\]<\/p>/gi, toc);
  }
  return { html, headings, blocks, tables, links };
}

export function patch(source, start, end, replacement) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > source.length)
    throw new RangeError('Source range is outside the document');
  return source.slice(0, start) + replacement + source.slice(end);
}

export function replaceBlock(source, block, markdown) {
  const original = source.slice(block.start, block.end);
  const eol = newlineOf(original || source);
  const trailing = original.match(/(?:\r?\n)+$/)?.[0] ?? '';
  const normalized = markdown.replace(/\r?\n/g, '\n').replace(/\n+$/, '').replace(/\n/g, eol);
  return patch(source, block.start, block.end, normalized + trailing);
}

export function format(source, start, end, command, dialect, argument = '') {
  const profile = profiles[dialect];
  if (!profile) throw new Error('Invalid flavour');
  if (['table','task','strike'].includes(command) && !profile[command === 'table' ? 'tables' : command === 'task' ? 'tasks' : 'strike'])
    throw new Error(`${command} is not supported by ${profile.name}`);
  const selected = source.slice(start, end), eol = newlineOf(source);
  let replacement, cursor;
  const wrappers = { bold: ['**','**'], italic: ['*','*'], strike: ['~~','~~'], link: ['[', `](${argument || 'https://example.com'})`] };
  if (wrappers[command]) {
    const [a,b] = wrappers[command];
    if (selected.startsWith(a) && selected.endsWith(b) && selected.length >= a.length+b.length) {
      const unwrapped=selected.slice(a.length,-b.length);
      return {source:patch(source,start,end,unwrapped),selection:[start,start+unwrapped.length]};
    }
    if (start >= a.length && source.slice(start-a.length,start) === a && source.slice(end,end+b.length) === b) {
      return {source:patch(source,start-a.length,end+b.length,selected),selection:[start-a.length,end-a.length]};
    }
    const text = selected || (command === 'link' ? 'link text' : 'text');
    replacement = a + text + b; cursor = [start + a.length, start + a.length + text.length];
  } else if (command === 'code') {
    const ticks = '`'.repeat(Math.max(1, ...[...selected.matchAll(/`+/g)].map(m => m[0].length + 1)));
    const pad = selected.includes('`') ? ' ' : '';
    replacement = ticks + pad + (selected || 'code') + pad + ticks;
  } else if (command === 'fence') {
    if (!/^[\w+#.-]*$/.test(argument)) throw new Error('Invalid code language');
    const fence = '`'.repeat(Math.max(3, ...[...selected.matchAll(/`+/g)].map(m => m[0].length + 1)));
    replacement = `${fence}${argument}${eol}${selected}${selected.endsWith('\n') || !selected ? '' : eol}${fence}${eol}`;
  } else if (command === 'table') replacement = `| Heading | Heading |${eol}| --- | --- |${eol}| Cell | Cell |${eol}`;
  else if (['heading','bullet','ordered','task','quote','indent','outdent'].includes(command)) {
    if(end>start && source[end-1]==='\n') end--;
    start = start===0 ? 0 : source.lastIndexOf('\n', start - 1) + 1;
    const next = source.indexOf('\n', end); end = next < 0 ? source.length : next;
    const prefix = command === 'heading' ? '#'.repeat(Math.min(6, Math.max(1, Number(argument) || 2))) + ' ' :
      ({ bullet: '- ', ordered: '1. ', task: '- [ ] ', quote: '> ', indent: '  ', outdent: '' })[command];
    replacement = source.slice(start, end).split(/\r?\n/).map(line => {
      if (command === 'outdent') return line.replace(/^( {1,2}|\t)/, '');
      if (command === 'heading') return prefix + line.replace(/^ {0,3}#{1,6}\s+/, '');
      return prefix + line;
    }).join(eol);
  } else throw new Error('Unknown formatting command');
  if (['fence','table'].includes(command)) {
    if (start > 0 && !source.slice(0, start).endsWith(eol + eol)) replacement = eol + eol + replacement;
    if (end < source.length && !source.slice(end).startsWith(eol)) replacement += eol;
  }
  return { source: patch(source, start, end, replacement), selection: cursor || [start, start + replacement.length] };
}

// Split GFM cells without splitting escaped pipes or pipes inside code spans.
export function tableCells(line) {
  const cells = []; let cell = '', ticks = 0;
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) { cell += s[i] + s[++i]; continue; }
    if (s[i] === '`') { let j = i; while (s[j] === '`') j++; const n = j-i; ticks = ticks === n ? 0 : ticks === 0 ? n : ticks; cell += s.slice(i,j); i=j-1; continue; }
    if (s[i] === '|' && !ticks) { cells.push(cell.trim()); cell = ''; } else cell += s[i];
  }
  cells.push(cell.trim()); return cells;
}

export function editTable(source, table, action, index = 0, value = '') {
  const original = source.slice(table.start, table.end), eol = newlineOf(original);
  const rows = original.trimEnd().split(/\r?\n/).map(tableCells);
  if (rows.length < 2 || !rows[1].every(c => /^:?-+:?$/.test(c))) throw new Error('No editable Markdown table here');
  const columns = rows[0].length;
  rows.forEach(row => { while (row.length < columns) row.push(''); });
  if (action === 'add-row') rows.splice(Math.max(2, Math.min(rows.length, index + 1)), 0, Array(columns).fill(''));
  else if (action === 'remove-row') { if (index < 2 || index >= rows.length) throw new Error('Select a body row'); rows.splice(index,1); }
  else if (action === 'add-column') rows.forEach((r,i) => r.splice(Math.min(columns,index + 1),0,i === 1 ? '---' : ''));
  else if (action === 'remove-column') { if (columns === 1) throw new Error('A table needs at least one column'); rows.forEach(r => r.splice(index,1)); }
  else if (action === 'cell') {
    const [r,c] = index;
    if (r === 1 || !rows[r] || c < 0 || c >= columns) throw new Error('Invalid table cell');
    rows[r][c] = String(value).replace(/\r?\n/g, '<br>').replace(/(?<!\\)\|/g, '\\|');
  } else throw new Error('Unknown table operation');
  return replaceBlock(source, table, rows.map(r => '| ' + r.join(' | ') + ' |').join(eol));
}

export function spreadsheetTable(text, eol = '\n') {
  const rows = text.trimEnd().split(/\r?\n/).map(l => l.split('\t').map(c => c.replace(/\|/g, '\\|')));
  const columns = Math.max(...rows.map(r => r.length));
  rows.forEach(r => { while (r.length < columns) r.push(''); });
  rows.splice(1,0,Array(columns).fill('---'));
  return rows.map(r => '| ' + r.join(' | ') + ' |').join(eol) + eol;
}

export function resolveDialect({ global = 'gitlab', project, file } = {}) {
  for (const [scope,value] of [['file',file],['project',project],['global',global]])
    if (validDialect(value)) return { dialect: value, scope };
  return { dialect: 'gitlab', scope: 'default' };
}

export function diagnostics(source, dialect, knownFiles = null) {
  const result = render(source, dialect), issues = [], offsets = lineOffsets(source);
  const excluded = result.blocks.filter(b => ['fence','code_block','front_matter'].includes(b.type));
  const add = (line, message, severity = 'warning') => issues.push({ line, start: offsets[line - 1] ?? 0, message, severity });
  const definitions = new Set([...source.matchAll(/^ {0,3}\[([^\]^]+)\]:/gm)].map(m => m[1].toLowerCase()));
  for(const block of result.blocks) if(block.type==='fence' && /^(plantuml|kroki|graphviz|glql)\b/i.test(block.info))
    add(block.line,`${block.info.split(/\s/)[0]} rendering needs an external integration; its source is preserved`,'info');
  source.split(/\r?\n/).forEach((line,i) => {
    if (excluded.some(b => offsets[i] >= b.start && offsets[i] < b.end)) return;
    if (dialect === 'commonmark' && /^\s*[-*+] \[[ xX]\]/.test(line)) add(i+1,'Task lists are not supported by CommonMark');
    if (dialect === 'commonmark' && /~~[^~]+~~/.test(line)) add(i+1,'Strikethrough is not supported by CommonMark');
    if (dialect === 'commonmark' && /^\s*\|?\s*:?-{3,}:?\s*\|/.test(line)) add(i+1,'Tables are not supported by CommonMark');
    if (dialect !== 'gitlab' && /\[\^.+?\]|\{[+-].+?[+-]\}|\[\[_?TOC_?\]\]/i.test(line)) add(i+1,'GitLab extension is not enabled in this flavour');
    if (/<\/?[A-Za-z][^>]*>/.test(line)) add(i+1,'Raw HTML is preserved; unsafe elements are removed from preview', 'info');
    if (/(?:^|\s)@\w+|(?:^|\s)[#!]\d+\b|\[include\b|\bglql\b/i.test(line)) add(i+1,'GitLab references/includes/queries require server context', 'info');
    for (const match of line.matchAll(/(?<!!)\[([^\]]+)\]\[([^\]]*)\]/g))
      if (!definitions.has((match[2] || match[1]).toLowerCase())) add(i+1,`Missing reference definition: ${match[2] || match[1]}`);
  });
  for (const link of result.links) {
    if (link.href?.startsWith('#') && !result.headings.some(h => h.id === decodeSafe(link.href.slice(1)))) add(link.line,`Missing heading: ${link.href}`);
    if (Array.isArray(knownFiles) && link.href && !/^(?:[a-z][\w+.-]*:|#|\/)/i.test(link.href)) {
      const path = decodeSafe(link.href.split('#')[0]);
      if (!knownFiles.includes(path)) add(link.line,`Missing local ${link.image ? 'image' : 'link'}: ${path}`);
    }
  }
  return issues;
}
function decodeSafe(s) { try { return decodeURIComponent(s); } catch { return s; } }

export function completions(source, dialect, files, query = '') {
  return [...render(source,dialect).headings.map(h => ({ label: h.text, value: '#' + h.id })),
    ...files.map(file => ({ label: file, value: file }))].filter(x =>
      (x.label + x.value).toLowerCase().includes(query.toLowerCase()));
}

export class History {
  constructor(source = '') { this.entries = [source]; this.index = 0; }
  get source() { return this.entries[this.index]; }
  push(source) { if (source === this.source) return false; this.entries.splice(this.index+1); this.entries.push(source); this.index++; return true; }
  undo() { if (this.index > 0) this.index--; return this.source; }
  redo() { if (this.index+1 < this.entries.length) this.index++; return this.source; }
}

export function exportHTML(html, { title = 'Markdown document', fontSize = 12, margin = 20, theme = 'paper' } = {}) {
  fontSize = Math.max(8, Math.min(24, Number(fontSize) || 12));
  margin = Math.max(5, Math.min(50, Number(margin) || 20));
  const background = theme === 'paper' ? '#fff' : '#faf8f2';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(title)}</title><style>body{background:${background};color:#202124;font:${fontSize}pt/1.6 system-ui;max-width:900px;margin:${margin}mm auto;padding:0 12px}pre{white-space:pre-wrap;background:#f4f4f4;padding:12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:6px}img,svg{max-width:100%}blockquote{border-left:3px solid #aaa;padding-left:1em}a{color:#1759aa}h1,h2,h3{break-after:avoid}tr,pre{break-inside:avoid}@page{margin:${margin}mm}</style></head><body>${html}</body></html>`;
}
