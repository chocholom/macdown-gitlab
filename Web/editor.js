import { profiles, render, patch, replaceBlock, format, editTable, spreadsheetTable, diagnostics,
  completions, History, exportHTML as makeExport, escapeHTML, newlineOf,
  sourceOffset,textareaOffset,sourceInput } from './core.js';
import DOMPurify from 'dompurify';
import TurndownService from 'turndown';
import mermaid from 'mermaid';
import { readingNavigation } from './navigation-ui.js';

const $ = id => document.getElementById(id);
const native = Boolean(window.webkit?.messageHandlers?.native);
function send(action, data = {}) {
  if (native) window.webkit.messageHandlers.native.postMessage({ action, ...data });
  else if (action === 'save') { localStorage.setItem('demo-source',history.source); notice('Saved locally for browser preview'); $('dirty').textContent=''; }
  else if (action === 'new') load({ ...state,source:'',filename:'Untitled.md' });
  else if (action === 'dialect') { settings({ ...state,dialect:data.dialect || 'gitlab',scope:data.scope }); localStorage.setItem('demo-dialect',state.dialect); }
  else if (action === 'exportHTML') download(exportHTML(),'document.html','text/html');
  else notice('This action is available in the native macOS application');
}
const turndown = new TurndownService({ headingStyle:'atx',codeBlockStyle:'fenced',bulletListMarker:'-',emDelimiter:'*' });
turndown.addRule('strike',{filter:['del','s','strike'],replacement:content => '~~'+content+'~~'});
turndown.addRule('inlineCode',{filter:'code',replacement:(content,node) => {
  const ticks = '`'.repeat(Math.max(1,...[...content.matchAll(/`+/g)].map(m=>m[0].length+1)));
  const pad = content.includes('`') ? ' ' : ''; return ticks+pad+content+pad+ticks;
}});
mermaid.initialize({ startOnLoad:false,securityLevel:'strict',theme:'default',htmlLabels:false,flowchart:{htmlLabels:false} });
let state = { source:'',dialect:'gitlab',scope:'global',files:[],localFiles:[],filename:'Untitled.md',warning:'',assetBase:'' };
let history = new History(), savedSource='', parsed = render('', 'gitlab'), mode = 'split', active = null, selectedTable = null;
let matches = [], matchIndex = -1, remote = false, renderGeneration = 0, previousSelection = [0,0],visualRange=null,diagramWork=Promise.resolve();
let navigation;
const clean = html => DOMPurify.sanitize(html,{ FORBID_TAGS:['style','form','iframe','object','embed'], ADD_ATTR:['data-start','data-end','data-kind','data-editable'], ADD_TAGS:['math','semantics','annotation'], ADD_URI_SAFE_ATTR:['data-start','data-end'],
  ALLOWED_URI_REGEXP:/^(?:(?:https?|mailto|mdasset):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i });

function notice(message,error = false) {
  $('notice').hidden=false; $('notice').textContent=message; $('notice').classList.toggle('error',error);
}
function settings(next) {
  state={...state,...next};
  $('dialect').value=state.dialect; $('filename').textContent=state.filename;
  $('profile-status').textContent=profiles[state.dialect].name+' · '+state.scope+' setting';
  $('project-name').textContent=state.project || 'Project';
  $('warning').hidden=!state.warning; $('warning').textContent=state.warning || '';
  if (state.gitlabInstance) $('instance').value=state.gitlabInstance;
  if (state.gitlabProject) $('gitlab-project').value=state.gitlabProject;
  document.querySelectorAll('[data-command]').forEach(button=>{
    const command=button.dataset.command;
    button.disabled=(command==='table'&&!profiles[state.dialect].tables)||(command==='task'&&!profiles[state.dialect].tasks)||(command==='strike'&&!profiles[state.dialect].strike);
    button.title=button.disabled ? `Not supported by ${profiles[state.dialect].name}` : command;
  });
  $('files').replaceChildren(...state.files.filter(f=>/\.(md|markdown|mdown)$/i.test(f)).map(file=>{
    const button=document.createElement('button'); button.textContent=file; button.onclick=()=>send('openFile',{path:file}); return button;
  }));
  remote=false; update();
}
function load(next) {
  history=new History(next.source || ''); active=null; selectedTable=null;
  savedSource=next.modified ? null : history.source;
  $('source').value=history.source; $('dirty').textContent=next.modified ? '●' : ''; settings(next);
  navigation?.reset();
}
function change(source,{visual=false}={}) {
  if (!history.push(source)) return;
  $('source').value=source; $('dirty').textContent=source===savedSource ? '' : '●'; send('change',{source});
  remote=false; update({visual});
}
function assetURLs(article) {
  article.querySelectorAll('img').forEach(img=>{
    const src=img.getAttribute('src');
    if (src && !/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(src) && state.assetBase) img.src=new URL(src,state.assetBase).href;
  });
}
async function diagrams(article,generation) {
  const nodes=[...article.querySelectorAll('.mermaid')];
  for (const node of nodes) {
    const text=node.textContent;
    try {
      const result=await mermaid.render('diagram-'+generation+'-'+Math.random().toString(36).slice(2),text);
      if (generation===renderGeneration && node.isConnected) { node.innerHTML=clean(result.svg); result.bindFunctions?.(node); }
    } catch { if (node.isConnected) node.textContent='Diagram could not render. Edit its source to fix the syntax.\n'+text; }
  }
}
function update({visual=false}={}) {
  parsed=render(history.source,state.dialect); renderGeneration++;
  if (!remote) {
    $('preview').innerHTML=clean(parsed.html); assetURLs($('preview'));
    $('preview-label').textContent=profiles[state.dialect].name+' · offline preview'; $('offline-preview').hidden=true;
    diagramWork=diagrams($('preview'),renderGeneration);
  }
  if (!visual) buildVisual();
  updateOutline(); updateDiagnostics(); updateCompletions(); search();
  $('counts').textContent=`${history.source.trim() ? history.source.trim().split(/\s+/u).length : 0} words · ${[...history.source].length} characters`;
  $('undo').disabled=history.index===0; $('redo').disabled=history.index===history.entries.length-1;
  navigation?.refresh();
}
function buildVisual() {
  active=null;visualRange=null; $('visual').innerHTML=clean(parsed.html); assetURLs($('visual'));
  $('visual').querySelectorAll('[data-editable=true]').forEach(node=>{
    // HTML, reference syntax, math, diffs and extension nodes remain source-editable.
    const raw=history.source.slice(Number(node.dataset.start),Number(node.dataset.end));
    if (/<\/?[A-Za-z]|\[[^\]]*\]\s*\[|\[\^|\$|\{[+-]|\[\[/.test(raw)) { node.dataset.editable='false'; return; }
    node.contentEditable='true'; node.setAttribute('aria-label','Edit '+node.dataset.kind);
  });
  $('visual').querySelectorAll('table').forEach(table=>{
    const mapped=table.closest('[data-kind=table]') || table;
    table.querySelectorAll('tr').forEach((row,r)=>row.querySelectorAll('th,td').forEach((cell,c)=>{
      cell.contentEditable='true'; cell.dataset.row=String(r===0 ? 0 : r+1); cell.dataset.column=String(c);
      cell.setAttribute('aria-label',`Edit table row ${r+1} column ${c+1}`);
      cell.dataset.start=mapped.dataset.start; cell.dataset.end=mapped.dataset.end; cell.dataset.kind='cell';
    }));
  });
  diagrams($('visual'),renderGeneration);
}
function updateOutline() {
  const query=$('outline-filter').value.toLowerCase();
  $('outline').replaceChildren(...parsed.headings.filter(h=>h.text.toLowerCase().includes(query)).map(h=>{
    const button=document.createElement('button'); button.textContent=h.text || '(empty heading)';
    button.style.setProperty('--level',h.level-1); button.onclick=()=>{
      jump(h.start,false); const pane=mode==='visual' ? $('visual') : $('preview');
      pane.querySelector(`[id="${CSS.escape(h.id)}"]`)?.scrollIntoView({block:'start'});
    }; return button;
  }));
}
function updateDiagnostics() {
  const issues=diagnostics(history.source,state.dialect,state.localFiles.length || (state.project && state.project!=='No project') ? state.localFiles : null);
  $('diagnostic-count').textContent=String(issues.length);
  $('diagnostics').replaceChildren(...issues.map(issue=>{
    const button=document.createElement('button'); button.textContent=`Line ${issue.line}: ${issue.message}`;
    button.onclick=()=>jump(issue.start); return button;
  }));
}
function updateCompletions() {
  $('link-targets').replaceChildren(...completions(history.source,state.dialect,state.localFiles).map(item=>{
    const option=document.createElement('option'); option.value=item.value; option.label=item.label; return option;
  }));
}
function jump(start,reveal=true) {
  if(reveal) { navigation.showSource(start);return; }
  const source=$('source'); source.focus(); const offset=textareaOffset(history.source,start);source.setSelectionRange(offset,offset);
  const line=history.source.slice(0,start).split('\n').length;
  const style=getComputedStyle(source);
  source.scrollTop=Math.max(0,parseFloat(style.paddingTop)+(line-.5)*parseFloat(style.lineHeight)-source.clientHeight/2); $('position').textContent='Line '+line;
}
function setMode(next) { const position=navigation?.capture();flush(); mode=next; $('workspace').dataset.mode=mode;
  document.querySelectorAll('[data-mode]').forEach(node=>{ if (node.tagName==='BUTTON') node.setAttribute('aria-pressed',String(node.dataset.mode===mode)); });
  buildVisual();navigation?.restore(position ?? 0); if (mode==='source' || mode==='split') $('source').focus({preventScroll:true});
}
function beginVisual(node) {
  if (active?.node===node) return;
  flush();
  const start=Number(node.dataset.start),end=Number(node.dataset.end);
  active={node,start,end,base:history.source,html:node.innerHTML,kind:node.dataset.kind};
  previousSelection=[start,end];
  if (active.kind==='cell') selectedTable={start,end,row:Number(node.dataset.row),column:Number(node.dataset.column)};
  else selectedTable=parsed.tables.find(t=>start>=t.start&&start<t.end) || null;
  $('table-tools').hidden=!selectedTable;
}
function commitVisual() {
  if (!active || active.html===active.node.innerHTML) return;
  const {node,start,end,base,kind}=active;
  let source;
  if (kind==='cell') source=editTable(base,{start,end},'cell',[Number(node.dataset.row),Number(node.dataset.column)],turndown.turndown(node.innerHTML));
  else {
    const clone=node.cloneNode(true); clone.removeAttribute('contenteditable');
    source=replaceBlock(base,{start,end},turndown.turndown(clone.outerHTML));
  }
  const delta=source.length-history.source.length;
  const currentEnd=Number(node.dataset.end);
  if(delta) $('visual').querySelectorAll('[data-start]').forEach(mapped=>{
    const a=Number(mapped.dataset.start),b=Number(mapped.dataset.end);
    if(a>=currentEnd) { mapped.dataset.start=String(a+delta);mapped.dataset.end=String(b+delta); }
    else if(a===start && b===currentEnd) mapped.dataset.end=String(b+delta);
  });
  change(source,{visual:true});
}
function flush() { commitVisual(); active=null; }
function command(name,argument='') {
  try {
    if (mode==='visual' && active && ['bold','italic','strike','link'].includes(name)) {
      const cmd=({bold:'bold',italic:'italic',strike:'strikeThrough',link:'createLink'})[name];
      document.execCommand(cmd,false,name==='link' ? argument || 'https://example.com' : null); commitVisual(); return;
    }
    const range=active ? [Number(active.node.dataset.start),Number(active.node.dataset.end)] : [sourceOffset(history.source,$('source').selectionStart),sourceOffset(history.source,$('source').selectionEnd)];
    if(active) range[1]-=(history.source.slice(...range).match(/[\r\n]+$/)?.[0].length || 0);
    flush();
    const result=format(history.source,...range,name,state.dialect,argument);
    change(result.source); $('source').setSelectionRange(...result.selection.map(offset=>textareaOffset(history.source,offset))); previousSelection=result.selection;
    if (mode==='visual') buildVisual(); else $('source').focus();
  } catch(error) { notice(error.message,true); }
}
function undo() { flush(); const source=history.undo(); $('source').value=source; $('dirty').textContent=source===savedSource ? '' : '●'; send('change',{source}); remote=false; update(); }
function redo() { flush(); const source=history.redo(); $('source').value=source; $('dirty').textContent=source===savedSource ? '' : '●'; send('change',{source}); remote=false; update(); }
function search() {
  const article=$('preview');
  article.querySelectorAll('mark').forEach(mark=>mark.replaceWith(document.createTextNode(mark.textContent)));
  article.normalize(); matches=[]; matchIndex=-1;
  const query=$('search').value;
  if (query) {
    const walker=document.createTreeWalker(article,NodeFilter.SHOW_TEXT); const nodes=[];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    for(const node of nodes) {
      if(node.parentElement.closest('svg,style,script')) continue;
      const text=node.textContent, lower=text.toLowerCase(), needle=query.toLowerCase();
      let at=0,index; const fragment=document.createDocumentFragment();
      while((index=lower.indexOf(needle,at))!==-1) {
        fragment.append(document.createTextNode(text.slice(at,index)));
        const mark=document.createElement('mark'); mark.textContent=text.slice(index,index+query.length); fragment.append(mark); matches.push(mark); at=index+query.length;
      }
      if(at) { fragment.append(document.createTextNode(text.slice(at))); node.replaceWith(fragment); }
    }
  }
  $('match-count').textContent=matches.length ? `${matches.length} matches` : query ? 'No matches' : '';
}
function nextMatch(direction) {
  if(!matches.length) return;
  matches[matchIndex]?.classList.remove('active'); matchIndex=(matchIndex+direction+matches.length)%matches.length;
  const match=matches[matchIndex]; match.classList.add('active'); match.scrollIntoView({block:'center'});
  const block=match.closest('[data-start]'); if(block) jump(Number(block.dataset.start),false);
  $('match-count').textContent=`${matchIndex+1} of ${matches.length}`;
}
function exportHTML() {
  flush();
  // Render local diagrams to SVG before export; retain bundled math styling inline.
  const clone=$('preview').cloneNode(true);
  clone.querySelectorAll('[contenteditable]').forEach(n=>n.removeAttribute('contenteditable'));
  clone.querySelectorAll('mark').forEach(n=>n.replaceWith(...n.childNodes));
  let html=clean(remote ? parsed.html : clone.innerHTML);
  return makeExport(html,{title:state.filename,fontSize:$('export-font').value,margin:$('export-margin').value,theme:$('export-theme').value});
}
function download(content,name,type) { const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href); }

$('source').addEventListener('input',()=>{ active=null; const selection=[$('source').selectionStart,$('source').selectionEnd];
  change(sourceInput(history.source,$('source').value));$('source').setSelectionRange(...selection); });
$('source').addEventListener('select',()=>{
  previousSelection=[sourceOffset(history.source,$('source').selectionStart),sourceOffset(history.source,$('source').selectionEnd)];
  $('position').textContent='Line '+history.source.slice(0,previousSelection[0]).split('\n').length;
  selectedTable=parsed.tables.find(t=>previousSelection[0]>=t.start&&previousSelection[0]<t.end) || null;
  $('table-tools').hidden=!selectedTable;
});
$('source').addEventListener('paste',event=>{
  if([...event.clipboardData.items].some(item=>item.type.startsWith('image/'))) { event.preventDefault(); send('pasteImage'); return; }
  const text=event.clipboardData.getData('text/plain');
  if(text.includes('\t') && text.includes('\n') && profiles[state.dialect].tables) {
    event.preventDefault(); const start=sourceOffset(history.source,$('source').selectionStart),end=sourceOffset(history.source,$('source').selectionEnd);
    const eol=newlineOf(history.source);
    const prefix=start>0 && !history.source.slice(0,start).endsWith(eol+eol) ? eol+eol : '';
    const suffix=end<history.source.length && !history.source.slice(end).startsWith(eol) ? eol : '';
    change(patch(history.source,start,end,prefix+spreadsheetTable(text,eol)+suffix));
  }
});
$('visual').addEventListener('focusin',event=>{
  const node=event.target.closest('[contenteditable=true]'); if(node) beginVisual(node);
});
$('visual').addEventListener('input',()=>{ try { commitVisual(); } catch(error) { notice(error.message,true); } });
$('visual').addEventListener('keydown',event=>{
  if(event.key==='Enter' && !event.shiftKey && event.target.closest('[contenteditable=true]')) { event.preventDefault(); document.execCommand('insertLineBreak'); }
});
$('visual').addEventListener('paste',event=>{
  const node=event.target.closest('[contenteditable=true]'); if(!node) return;
  event.preventDefault(); document.execCommand('insertText',false,event.clipboardData.getData('text/plain')); commitVisual();
});
for(const pane of [$('preview'),$('visual')]) {
  pane.addEventListener('dblclick',event=>{ if(event.target.closest('[contenteditable=true]')) return; const block=event.target.closest('[data-start]'); if(block) jump(Number(block.dataset.start)); });
  pane.addEventListener('click',event=>{
    if(event.target.matches('input[type=checkbox]')) {
      const item=event.target.closest('[data-kind=list_item]');
      if(item) {
        const start=Number(item.dataset.start),end=Number(item.dataset.end),raw=history.source.slice(start,end);
        const match=raw.match(/^\s*[-*+] \[([ xX])\]/);
        if(match) {flush();const index=start+match[0].lastIndexOf('[')+1;change(patch(history.source,index,index+1,match[1]===' ' ? 'x' : ' '));}
      }
      return;
    }
    const link=event.target.closest('a'); if(!link) return;
    const href=link.getAttribute('href');
    if(href?.startsWith('#')) { event.preventDefault(); pane.querySelector(`[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`)?.scrollIntoView(); }
    else if(href && !/^[a-z][\w+.-]*:/i.test(href)) { event.preventDefault(); send('openLink',{path:href.split('#')[0],anchor:href.split('#')[1] || ''}); }
  });
}
document.querySelectorAll('[data-mode]').forEach(button=>{ if(button.tagName==='BUTTON') button.onclick=()=>setMode(button.dataset.mode); });
document.querySelectorAll('[data-native]').forEach(button=>button.onclick=()=>{flush();send(button.dataset.native);});
document.querySelectorAll('[data-command]').forEach(button=>{
  button.addEventListener('mousedown',event=>event.preventDefault());
  button.onclick=()=>command(button.dataset.command,button.dataset.command==='fence' ? $('language').value : '');
});
document.querySelectorAll('[data-table]').forEach(button=>button.onclick=()=>{
  try {
    flush(); if(!selectedTable) throw new Error('Place the cursor in a table first');
    const index=button.dataset.table.includes('column') ? selectedTable.column || 0 : selectedTable.row ?? 2;
    const table=parsed.tables.find(t=>t.start===selectedTable.start);
    change(editTable(history.source,table,button.dataset.table,index));
    selectedTable=parsed.tables.find(t=>t.start===selectedTable.start); $('table-tools').hidden=!selectedTable;
  } catch(error) { notice(error.message,true); }
});
$('settings-toggle').onclick=()=>{ $('settings').hidden=!$('settings').hidden; $('settings-toggle').setAttribute('aria-expanded',String(!$('settings').hidden)); };
$('set-dialect').onclick=()=>{ flush(); send('dialect',{dialect:$('dialect').value,scope:$('scope').value}); };
$('reset-dialect').onclick=()=>{ flush(); send('dialect',{dialect:'',scope:$('scope').value}); };
$('appearance').value=localStorage.getItem('appearance') || 'system';
document.documentElement.dataset.appearance=$('appearance').value;
$('appearance').onchange=()=>{ document.documentElement.dataset.appearance=$('appearance').value;localStorage.setItem('appearance',$('appearance').value); };
for(const id of ['export-theme','export-font','export-margin']) {
  if(localStorage.getItem(id)) $(id).value=localStorage.getItem(id);
  $(id).onchange=()=>localStorage.setItem(id,$(id).value);
}
$('link-toggle').addEventListener('mousedown',()=>{const selection=window.getSelection();if(selection.rangeCount && $('visual').contains(selection.anchorNode))visualRange=selection.getRangeAt(0).cloneRange();});
$('link-toggle').onclick=()=>{ $('link-panel').hidden=!$('link-panel').hidden; if(!$('link-panel').hidden) $('link-target').focus(); };
$('insert-link').onclick=()=>{ if(mode==='visual' && visualRange && active){const selection=window.getSelection();selection.removeAllRanges();selection.addRange(visualRange);}else $('source').setSelectionRange(...previousSelection.map(offset=>textareaOffset(history.source,offset))); command('link',$('link-target').value); $('link-panel').hidden=true; };
$('undo').onclick=undo; $('redo').onclick=redo;
$('outline-filter').oninput=updateOutline; $('search').oninput=search;
$('next-match').onclick=()=>nextMatch(1); $('previous-match').onclick=()=>nextMatch(-1);
$('project-search').onclick=()=>send('projectSearch',{query:$('project-query').value});
$('project-query').onkeydown=e=>{ if(e.key==='Enter') send('projectSearch',{query:$('project-query').value}); };
$('remote-preview').onclick=()=>{ flush();send('remotePreview',{instance:$('instance').value,project:$('gitlab-project').value}); };
$('offline-preview').onclick=()=>{remote=false;update();};
document.addEventListener('keydown',event=>{
  const meta=event.metaKey || event.ctrlKey;
  if(meta && ['s','z','b','i','f'].includes(event.key.toLowerCase())) {
    event.preventDefault(); const key=event.key.toLowerCase();
    if(key==='s') {flush();send('save');}
    if(key==='z') event.shiftKey ? redo() : undo();
    if(key==='b') command('bold'); if(key==='i') command('italic'); if(key==='f') $('search').focus();
  }
  if(event.key==='Escape') {flush();buildVisual();$('notice').hidden=true;}
});
window.editor={ load,settings,flush,undo,redo,find:()=>$('search').focus(),exportHTML,
  prepareExport:async()=>{flush();if(remote){remote=false;update();}await diagramWork;return exportHTML();},
  markSaved:()=>{savedSource=history.source;$('dirty').textContent='';},
  jumpLine:line=>jump(history.source.split('\n').slice(0,Math.max(0,line-1)).join('\n').length+(line>1 ? 1 : 0)),
  jumpAnchor:anchor=>{ const heading=parsed.headings.find(h=>h.id===anchor);if(heading) jump(heading.start); },
  error:message=>notice(message,true),notice,
  remoteHTML:html=>{remote=true;$('preview').innerHTML=clean(html);$('preview-label').textContent='GitLab instance preview · server HTML';$('offline-preview').hidden=false;setMode('preview');},
  projectResults:results=>$('project-results').replaceChildren(...results.map(result=>{ const button=document.createElement('button');button.textContent=`${result.file}:${result.line} ${result.text}`;button.onclick=()=>send('openFile',{path:result.file,line:result.line});return button;})),
  insertImage:({path,alt:description})=>{const alt=(description || $('image-alt').value).replace(/[\[\]\r\n]/g,'');let [start,end]=previousSelection;let prefix='';if(mode==='visual'){start=end;prefix=newlineOf(history.source);}change(patch(history.source,start,end,prefix+`![${alt}](${encodeURI(path).replace(/[()]/g,c=>'%'+c.charCodeAt(0).toString(16))})`));},
  snapshot:()=>({source:history.source,dialect:state.dialect,mode,headings:parsed.headings})
};
navigation=readingNavigation({getSource:()=>history.source,getMode:()=>mode,setMode,flush,isRemote:()=>remote});
if(native) send('ready');
else load({source:localStorage.getItem('demo-source') || '# Welcome to MacDown GitLab\n\nEdit Markdown source or switch to **Visual edit**.\n\n## A table\n\n| Feature | Status |\n| --- | --- |\n| Offline preview | Ready |\n\n- [ ] Try GitLab flavour\n- [x] Keep ordinary Markdown files\n',dialect:localStorage.getItem('demo-dialect') || 'gitlab',scope:'global',files:[],localFiles:[],filename:'Welcome.md'});
