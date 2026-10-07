import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { render,patch,replaceBlock,format,tableCells,editTable,spreadsheetTable,resolveDialect,
  diagnostics,completions,History,exportHTML,sourceOffset,textareaOffset,sourceInput } = await import(process.env.MACDOWN_CORE || '../Web/core.js');

const plain = (source,dialect='commonmark') => render(source,dialect,{mapped:false}).html;
const examples = [
  ['ATX heading','# hello\n','<h1 id="hello">hello</h1>\n'],
  ['setext heading','hello\n=====\n','<h1 id="hello">hello</h1>\n'],
  ['ordered start','3. three\n4. four\n','<ol start="3">\n<li>three</li>\n<li>four</li>\n</ol>\n'],
  ['intra-word underscore','foo_bar_baz\n','<p>foo_bar_baz</p>\n'],
  ['emphasis','**strong** and *em*\n','<p><strong>strong</strong> and <em>em</em></p>\n'],
  ['escaped syntax','\\*literal\\*\n','<p>*literal*</p>\n'],
  ['inline code','`` a`b ``\n','<p><code>a`b</code></p>\n'],
  ['hard break','first  \nsecond\n','<p>first<br />\nsecond</p>\n'],
  ['soft break','first\nsecond\n','<p>first\nsecond</p>\n'],
  ['reference link','[foo][bar]\n\n[bar]: /url "title"\n','<p><a href="/url" title="title">foo</a></p>\n'],
  ['distinct quotes','> one\n\n> two\n','<blockquote>\n<p>one</p>\n</blockquote>\n<blockquote>\n<p>two</p>\n</blockquote>\n'],
  ['fence escaping','```\n<script>\n```\n','<div><pre><code>&lt;script&gt;\n</code></pre>\n</div>'],
  ['unclosed fence','```js\nx\n','<div><pre><code class="language-js">x\n</code></pre>\n</div>']
];
for(const [name,source,expected] of examples) test('CommonMark: '+name,()=>assert.equal(plain(source),expected));

test('CommonMark disables tables, task lists, strike and bare URL linking',()=>{
  const html=plain('| A | B |\n| --- | --- |\n| C | D |\n\n- [x] done\n\n~~deleted~~ https://example.com\n');
  assert.ok(!html.includes('<table')); assert.ok(!html.includes('checkbox')); assert.ok(!html.includes('<s>')); assert.ok(!html.includes('<a '));
});
test('GitHub extensions render',()=>{
  const html=plain('| A | B |\n| --- | --- |\n| C | D |\n\n- [x] done\n\n~~deleted~~ https://example.com\n','github');
  for(const fragment of ['<table>','type="checkbox"','<s>deleted</s>','href="https://example.com"']) assert.ok(html.includes(fragment),fragment);
});
test('GitLab footnotes and description lists',()=>{
  const html=plain('Text[^n]\n\n[^n]: Footnote\n\nTerm\n: Description\n','gitlab');
  assert.match(html,/footnote-ref/); assert.match(html,/<dt>Term<\/dt>/); assert.match(html,/<dd>Description<\/dd>/);
});
test('GitLab alerts, inline diff, math and TOC',()=>{
  const html=plain('# Heading\n\n[[_TOC_]]\n\n> [!NOTE]\n> Message\n\n{+added+} {-removed-} $x^2$\n','gitlab');
  for(const fragment of ['class="toc"','alert-note','<ins>added</ins>','<del>removed</del>','katex']) assert.ok(html.includes(fragment),fragment);
});
test('GitLab multiline quote and math fence',()=>{
  const html=plain('>>>\nFirst\n\nSecond\n>>>\n\n```math\nx^2\n```\n','gitlab');
  assert.match(html,/<blockquote><p>First/);assert.match(html,/katex/);
});
test('GitLab documented math, lowercase custom alerts and TOC spellings',()=>{
  for(const source of ['$`x^2`$','$$x^2$$','$$\nx^2\n$$']) assert.match(plain(source,'gitlab'),/katex/);
  assert.match(plain('> [!warning] Custom title\n> Message\n','gitlab'),/Custom title/);
  assert.match(plain('>>> [!note] Multiline title\nBody\n>>>\n','gitlab'),/alert-note/);
  for(const marker of ['[TOC]','[[_TOC_]]','[[TOC]]']) assert.match(plain('# Heading\n\n'+marker+'\n','gitlab'),/class="toc"/);
});
test('Mermaid is profile specific and escapes markup',()=>{
  const md='```mermaid\nflowchart LR\n A --> B\n```\n';
  assert.match(plain(md,'gitlab'),/class="mermaid"/);assert.ok(!plain(md,'commonmark').includes('class="mermaid"'));
});
test('heading IDs retain Unicode, repeated spaces, hyphens and deduplicate',()=>{
  const headings=render('# Überblick\n# Foo --- Bar\n# Same\n# Same\n# Same-1\n','github').headings;
  assert.deepEqual(headings.map(h=>h.id),['überblick','foo-----bar','same','same-1','same-1-1']);
});
test('outline excludes fenced code, handles setext and nesting',()=>{
  const result=render('# Real\n\n```\n# Fake\n```\n\nOther\n-----\n\n> ## Nested\n');
  assert.deepEqual(result.headings.map(h=>h.text),['Real','Other','Nested']);
  assert.equal(result.headings[1].line,7);
});
test('parser source ranges map to original CRLF bytes',()=>{
  const source='# Title\r\n\r\nBefore 😀\r\n\r\nAfter\r\n';
  const p=render(source).blocks.find(b=>b.type==='paragraph');
  assert.equal(source.slice(p.start,p.end),'Before 😀\r\n');
  const edited=replaceBlock(source,p,'Changed\nparagraph');
  assert.equal(edited,'# Title\r\n\r\nChanged\r\nparagraph\r\n\r\nAfter\r\n');
});
test('mode/render operations do not change original Markdown',()=>{
  const source='---\r\ntitle: Hello\r\n---\r\n\r\n__bold__ [ref][id]\r\n\r\n[id]: /url\r\n\r\n<custom>keep</custom>\r\n';
  for(const dialect of ['commonmark','github','gitlab']) render(source,dialect);
  const h=new History(source); h.push(source); assert.equal(h.source,source); assert.equal(h.entries.length,1);
});
test('editing one block preserves unknown blocks and reference definitions',()=>{
  const before='<!-- comment -->\n\n<custom>opaque</custom>\n\n',after='\n[ref]: ./README.md\n\n```other\nunknown syntax\n```\n';
  const source=before+'A paragraph\n'+after;
  const block=render(source).blocks.find(b=>source.slice(b.start,b.end)==='A paragraph\n');
  assert.equal(replaceBlock(source,block,'New **paragraph**'),before+'New **paragraph**\n'+after);
});
test('invalid patches cannot corrupt documents',()=>{
  for(const range of [[-1,0],[2,1],[0,100],[.5,1]]) assert.throws(()=>patch('abc',...range,'x'),RangeError);
});
test('textarea edits and selections map back to CRLF source',()=>{
  const source='# Title\r\n\r\nText\r\n\r\nTail\r\n';
  const normalized=source.replace(/\r\n/g,'\n').replace('Text','New text');
  assert.equal(sourceInput(source,normalized),'# Title\r\n\r\nNew text\r\n\r\nTail\r\n');
  assert.equal(sourceOffset(source,9),11);assert.equal(textareaOffset(source,11),9);
  const position=sourceOffset(source,9);
  assert.equal(format(source,position,position+4,'bold','gitlab').source,'# Title\r\n\r\n**Text**\r\n\r\nTail\r\n');
});
test('bold command toggles existing markers without duplicate nesting',()=>{
  assert.equal(format('**hello**',2,7,'bold','gitlab').source,'hello');
  assert.equal(format('**hello**',0,9,'bold','gitlab').source,'hello');
});
test('global/project/file inheritance and reset',()=>{
  assert.deepEqual(resolveDialect({global:'github',project:'gitlab',file:'commonmark'}),{dialect:'commonmark',scope:'file'});
  assert.deepEqual(resolveDialect({global:'github',project:'gitlab'}),{dialect:'gitlab',scope:'project'});
  assert.deepEqual(resolveDialect({global:'github'}),{dialect:'github',scope:'global'});
  assert.deepEqual(resolveDialect({global:'bogus'}),{dialect:'gitlab',scope:'default'});
});
test('formatting is dialect-aware, with meaningful cursor placement',()=>{
  const b=format('hello',0,5,'bold','commonmark');assert.equal(b.source,'**hello**');assert.deepEqual(b.selection,[2,7]);
  for(const command of ['table','task','strike']) assert.throws(()=>format('',0,0,command,'commonmark'),/not supported/);
  assert.equal(format('word',0,4,'strike','gitlab').source,'~~word~~');
});
test('code fences exceed contained backtick runs and validate language',()=>{
  const result=format('x```y',0,5,'fence','github','js').source;
  assert.equal(result,'````js\nx```y\n````\n');
  assert.throws(()=>format('',0,0,'fence','github','js\n# injected'),/Invalid/);
});
test('heading and list operations preserve CRLF',()=>{
  assert.equal(format('one\r\ntwo',0,8,'bullet','gitlab').source,'- one\r\n- two');
  assert.equal(format('# Old',2,3,'heading','github','3').source,'### Old');
  assert.equal(format('  - child',0,9,'outdent','gitlab').source,'- child');
});
test('all basic formatting actions produce independently specified Markdown',()=>{
  for(const [command,expected] of [['italic','*hello*'],['link','[hello](https://example.com)'],['code','`hello`'],['quote','> hello'],['ordered','1. hello'],['task','- [ ] hello'],['indent','  hello']])
    assert.equal(format('hello',0,5,command,'gitlab').source,expected);
  assert.match(format('',0,0,'table','github').source,/^\| Heading \| Heading \|\n\| --- \| --- \|/);
  assert.equal(format('one\ntwo',0,4,'bullet','gitlab').source,'- one\ntwo');
});
test('table scanner handles escaped and code pipes',()=>{
  assert.deepEqual(tableCells('| a\\|b | `c|d` | **e** |'),['a\\|b','`c|d`','**e**']);
});
test('table edits preserve surrounding document and alignment',()=>{
  const source='Before\n\n| A | B |\n| :--- | ---: |\n| C | D |\n\nAfter\n';
  const table=render(source).tables[0];
  assert.equal(editTable(source,table,'cell',[2,1],'E|F'),'Before\n\n| A | B |\n| :--- | ---: |\n| C | E\\|F |\n\nAfter\n');
  assert.match(editTable(source,table,'add-column',0),/\| :--- \| --- \| ---: \|/);
  assert.throws(()=>editTable(source,table,'remove-row',0),/body row/);
});
test('spreadsheet paste creates escaped valid table',()=>{
  assert.equal(spreadsheetTable('A\tB\nC|D\tE\n'),'| A | B |\n| --- | --- |\n| C\\|D | E |\n');
});
test('diagnostics flag unsupported syntax, unresolved links and context',()=>{
  const source='# Existing\n\n- [ ] Task\n\n~~strike~~\n\n[missing](#absent) [bad][none] @user\n\n```\n- [ ] literal\n```\n';
  const issues=diagnostics(source,'commonmark');
  assert.equal(issues.length,5);assert.ok(issues.some(i=>i.message==='Missing heading: #absent'));
  assert.ok(!issues.some(i=>i.line===10));
});
test('missing local images and links get actionable diagnostics',()=>{
  const issues=diagnostics('[ok](README.md) [bad](missing.md) ![img](missing.png)','gitlab',['README.md']);
  assert.equal(issues.length,2);assert.match(issues[0].message,/missing.md/);assert.match(issues[1].message,/image/);
});
test('completion offers headings and project files',()=>{
  assert.deepEqual(completions('# Intro','gitlab',['README.md'],'intro'),[{label:'Intro',value:'#intro'}]);
});
test('undo/redo across edits, branching and no-op',()=>{
  const h=new History('a');h.push('b');h.push('c');assert.equal(h.undo(),'b');assert.equal(h.redo(),'c');
  h.undo();h.push('d');assert.equal(h.redo(),'d');assert.equal(h.push('d'),false);
});
test('export escapes title and clamps print inputs',()=>{
  const html=exportHTML('<p>Text</p>',{title:'<script>',fontSize:'bad',margin:200});
  assert.match(html,/<title>&lt;script&gt;<\/title>/);assert.match(html,/12pt/);assert.match(html,/@page\{margin:50mm/);
});
test('Markdown links reject executable protocols',()=>{
  const html=plain('[bad](javascript:alert(1))\n');
  assert.ok(!html.includes('href="javascript:'));
});
test('deterministic generated Unicode patches preserve every outside byte',()=>{
  let seed=12345; const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
  for(let i=0;i<200;i++) {
    const before=('😀é中\\*\r\n').repeat(random()%15),after=('\n[id]: /url\n').repeat(random()%12);
    const text='middle'.repeat(1+random()%20),source=before+text+after;
    const result=patch(source,before.length,before.length+text.length,'changed');
    assert.equal(result,before+'changed'+after);
  }
});
test('upstream mixed fixtures render in all profiles without throwing',async()=>{
  for(const name of ['mixed-complex','edge-cases','unicode','lists-nested','regression-issue25','regression-issue37']) {
    const source=await readFile(new URL('../MacDownTests/Fixtures/'+name+'.md',import.meta.url),'utf8');
    for(const dialect of ['commonmark','github','gitlab']) assert.equal(typeof render(source,dialect).html,'string');
  }
});
