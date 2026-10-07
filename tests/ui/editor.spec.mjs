import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/');await expect(page.locator('#source')).toBeVisible();});
async function load(page,source,dialect='gitlab',extra={}) {
  await page.evaluate(({source,dialect,extra})=>window.editor.load({source,dialect,scope:'global',files:[],localFiles:[],filename:'Test.md',...extra}),{source,dialect,extra});
}
test('source preview outline and profile switching preserve document',async({page})=>{
  const source='# Title\r\n\r\n__bold__\r\n\r\n```\r\n# Fake\r\n```\r\n';await load(page,source);
  await expect(page.locator('#preview h1')).toHaveText('Title');await expect(page.locator('#outline button')).toHaveCount(1);
  for(const mode of ['Visual edit','Preview','Source','Split']) await page.getByRole('button',{name:mode,exact:true}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('#dialect').selectOption('commonmark');await page.locator('#scope').selectOption('global');await page.locator('#set-dialect').click();
  expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe(source);
  await expect(page.locator('[data-command=table]')).toBeDisabled();await expect(page.locator('[data-command=strike]')).toBeDisabled();
});
test('visual paragraph edits preserve unrelated source, including opaque syntax',async({page})=>{
  const before='---\r\ntitle: Keep\r\n---\r\n\r\n',after='\r\n[ref]: ./README.md\r\n\r\n<custom>untouched</custom>\r\n';
  await load(page,before+'Editable paragraph\r\n'+after);await page.getByRole('button',{name:'Visual edit',exact:true}).click();
  const editable=page.locator('#visual p[contenteditable=true]');await editable.fill('Changed paragraph');
  expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe(before+'Changed paragraph\r\n'+after);
  await page.locator('#undo').click();expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe(before+'Editable paragraph\r\n'+after);
  await page.locator('#redo').click();expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe(before+'Changed paragraph\r\n'+after);
});
test('editing two visual blocks remaps later source ranges correctly',async({page})=>{
  await load(page,'First\n\nSecond\n\nThird\n');await page.getByRole('button',{name:'Visual edit',exact:true}).click();
  await page.locator('#visual p').nth(0).fill('A longer first paragraph');
  await page.locator('#visual p').nth(1).fill('New second');
  expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe('A longer first paragraph\n\nNew second\n\nThird\n');
});
test('source edits and formatting retain CRLF in unrelated text',async({page})=>{
  const source='# Title\r\n\r\nText\r\n\r\nTail\r\n';await load(page,source);
  await page.locator('#source').fill('# Title\n\nNew text\n\nTail\n');
  expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe('# Title\r\n\r\nNew text\r\n\r\nTail\r\n');
  await page.locator('#source').evaluate(node=>node.setSelectionRange(9,12));await page.locator('[data-command=bold]').click();
  expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe('# Title\r\n\r\n**New** text\r\n\r\nTail\r\n');
});
test('visual heading formatting after an edit preserves next paragraph',async({page})=>{
  await load(page,'First\n\nSecond\n');await page.getByRole('button',{name:'Visual edit',exact:true}).click();
  await page.locator('#visual p').first().fill('A longer first paragraph');
  await page.locator('[data-command=heading]').click();
  expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe('## A longer first paragraph\n\nSecond\n');
});
test('adding an image from visual mode does not replace the paragraph',async({page})=>{
  await load(page,'First\n\nSecond\n');await page.getByRole('button',{name:'Visual edit',exact:true}).click();
  await page.locator('#visual p').first().click();
  await page.evaluate(()=>{window.editor.flush();window.editor.insertImage({path:'assets/test.png',alt:'Example'});});
  const source=await page.evaluate(()=>window.editor.snapshot().source);
  expect(source).toContain('First\n');expect(source).toContain('Second\n');expect(source).toContain('![Example](assets/test.png)');
});
test('bold source command selection and undo',async({page})=>{
  await load(page,'hello world\n');await page.locator('#source').focus();
  await page.locator('#source').evaluate(node=>node.setSelectionRange(0,5));
  await page.locator('[data-command=bold]').click();await expect(page.locator('#source')).toHaveValue('**hello** world\n');
  await page.locator('#undo').click();await expect(page.locator('#source')).toHaveValue('hello world\n');
});
test('visual formatting and link dialog retain selected text',async({page})=>{
  await load(page,'Hello world\n');await page.getByRole('button',{name:'Visual edit',exact:true}).click();
  await page.locator('#visual p').evaluate(node=>{node.focus();const range=document.createRange();range.setStart(node.firstChild,0);range.setEnd(node.firstChild,5);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);});
  await page.locator('[data-command=bold]').click();
  expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe('**Hello** world\n');
  await page.locator('#undo').click();
  await page.locator('#visual p').evaluate(node=>{node.focus();const range=document.createRange();range.setStart(node.firstChild,0);range.setEnd(node.firstChild,5);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);});
  await page.locator('#link-toggle').click();await page.locator('#link-target').fill('https://example.com');await page.locator('#insert-link').click();
  expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe('[Hello](https://example.com) world\n');
});
test('preview search highlights rendered text and navigates to source',async({page})=>{
  await load(page,'# Title\n\nA **needle** here\n\nAnother needle\n');
  await page.locator('#search').fill('needle');await expect(page.locator('#preview mark')).toHaveCount(2);
  await page.locator('#next-match').click();await expect(page.locator('#match-count')).toHaveText('1 of 2');
  expect(await page.locator('#source').evaluate(node=>node.selectionStart)).toBe(9);
});
test('double-click opaque block opens its mapped source',async({page})=>{
  await load(page,'# Title\n\n```js\nconsole.log(1)\n```\n');await page.getByRole('button',{name:'Preview',exact:true}).click();
  await page.locator('#preview pre').dblclick();await expect(page.locator('#source')).toBeVisible();
  expect(await page.locator('#source').evaluate(node=>node.selectionStart)).toBe(9);
});
test('visual table cell edit and structural commands preserve surrounding text',async({page})=>{
  await load(page,'Before\n\n| A | B |\n| --- | --- |\n| C | D |\n\nAfter\n');
  await page.getByRole('button',{name:'Visual edit',exact:true}).click();await page.locator('#visual td').nth(1).fill('New cell');
  expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe('Before\n\n| A | B |\n| --- | --- |\n| C | New cell |\n\nAfter\n');
  await page.getByRole('button',{name:'Add row',exact:true}).click();
  await expect(page.locator('#visual tbody tr')).toHaveCount(2);
  expect(await page.evaluate(()=>window.editor.snapshot().source)).toMatch(/^Before\n\n[\s\S]*\n\nAfter\n$/);
});
test('spreadsheet clipboard paste creates a separate valid table',async({page})=>{
  await load(page,'Before');
  await page.locator('#source').evaluate(node=>{node.focus();node.setSelectionRange(node.value.length,node.value.length);const clipboard=new DataTransfer();clipboard.setData('text/plain','A\tB\nC\tD');node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard,bubbles:true,cancelable:true}));});
  expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe('Before\n\n| A | B |\n| --- | --- |\n| C | D |\n');
  await expect(page.locator('#preview table')).toHaveCount(1);
});
test('task checkbox modifies only its marker',async({page})=>{
  await load(page,'- [ ] first\n- [x] second\n');await page.locator('#preview input[type=checkbox]').first().check();
  expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe('- [x] first\n- [x] second\n');
});
test('diagnostics, outline filtering and link completions',async({page})=>{
  await load(page,'# Intro\n\n## Details\n\n[bad](missing.md)\n','gitlab',{files:['README.md'],localFiles:['README.md']});
  await expect(page.locator('#diagnostics')).toContainText('Missing local link: missing.md');
  await page.locator('#outline-filter').fill('detail');await expect(page.locator('#outline button')).toHaveCount(1);
  await page.getByRole('button',{name:'Link…',exact:true}).click();await expect(page.locator('#link-targets option[value="#intro"]')).toHaveCount(1);
});
test('math and Mermaid render offline without network requests',async({page})=>{
  const remote=[];page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:8765')&&!request.url().startsWith('data:')) remote.push(request.url());});
  await load(page,'# Diagram\n\n$x^2$\n\n```mermaid\nflowchart LR\n A --> B\n```\n');
  await expect(page.locator('#preview .katex')).toHaveCount(1);await expect(page.locator('#preview .mermaid svg')).toHaveCount(1);
  await expect(page.locator('#preview .mermaid svg')).toContainText('A');
  await expect(page.locator('#preview .mermaid svg')).toContainText('B');
  expect(remote).toEqual([]);
});
test('sanitizer retains local image paths and relative links',async({page})=>{
  await load(page,'![local](assets/image.png) [guide](guide.md)\n');
  await expect(page.locator('#preview img')).toHaveAttribute('src','assets/image.png');
  await expect(page.locator('#preview a')).toHaveAttribute('href','guide.md');
});
test('untrusted document and server HTML cannot execute script',async({page})=>{
  await load(page,'<script>window.pwned=true</script>\n\n![x](x" onerror="window.pwned=true)\n');
  await page.evaluate(()=>window.editor.remoteHTML('<img src=x onerror="window.pwned=true"><script>window.pwned=true</script><p>Server</p>'));
  await expect(page.locator('#preview')).toContainText('Server');
  expect(await page.evaluate(()=>window.pwned)).toBeUndefined();await expect(page.locator('#preview script')).toHaveCount(0);
});
test('export uses independent print profile and leaves source untouched',async({page})=>{
  const source='# Export\n\nText\n';await load(page,source);
  await page.locator('#settings-toggle').click();await page.locator('#export-font').fill('16');await page.locator('#export-margin').fill('25');
  const html=await page.evaluate(()=>window.editor.exportHTML());expect(html).toContain('16pt');expect(html).toContain('@page{margin:25mm}');
  expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe(source);
});
test('export waits for local diagram rendering',async({page})=>{
  await load(page,'```mermaid\nflowchart LR\n A --> B\n```\n');
  const html=await page.evaluate(()=>window.editor.prepareExport());
  expect(html).toContain('<svg');expect(html).toContain('A');expect(html).toContain('B');
});
test('responsive light/dark views have no horizontal window overflow',async({page})=>{
  await page.setViewportSize({width:850,height:700});await page.locator('#settings-toggle').click();await page.locator('#appearance').selectOption('dark');
  expect(await page.evaluate(()=>document.documentElement.dataset.appearance)).toBe('dark');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/editor-dark.png',fullPage:true});
});

function readingDocument() {
  return '# Navigation 😀\r\n\r\n'+Array.from({length:48},(_,i)=>`## Part ${i}\r\n\r\nParagraph ${i}: ${'Different rendered heights and source lengths. '.repeat(12)}\r\n\r\n\`\`\`js\r\nconst first = ${i};\r\nconst second = first + 1;\r\nconsole.log(second);\r\n\`\`\`\r\n\r\n| Feature | Status |\r\n| --- | --- |\r\n| Navigation ${i} | Ready |\r\n\r\n`).join('');
}
async function scrollSourceTo(page,offset) {
  await page.locator('#source').evaluate((node,offset)=>{
    const line=node.value.slice(0,offset).split('\n').length-1,style=getComputedStyle(node);
    node.scrollTop=parseFloat(style.paddingTop)+(line+.5)*parseFloat(style.lineHeight)-node.clientHeight/2;
  },offset);
}
async function centreDistance(page,selector,pane='#preview-pane') {
  return page.locator(selector).evaluate((node,pane)=>{
    const block=node.getBoundingClientRect(),viewport=document.querySelector(pane).getBoundingClientRect();
    return Math.abs((block.top+block.bottom)/2-(viewport.top+viewport.bottom)/2);
  },pane);
}
async function centreLine(page) {
  return page.locator('#source').evaluate(node=>{const style=getComputedStyle(node);return (node.scrollTop+node.clientHeight/2-parseFloat(style.paddingTop))/parseFloat(style.lineHeight);});
}
async function scrollRenderedTo(page,selector,pane='#preview-pane') {
  await page.locator(selector).evaluate((node,pane)=>{
    const viewport=document.querySelector(pane),rect=viewport.getBoundingClientRect(),block=node.getBoundingClientRect();
    viewport.scrollTop+=(block.top+block.bottom-rect.top-rect.bottom)/2;
  },pane);
}
test('linked scrolling follows source and rendered centres without changing caret or bytes',async({page})=>{
  const text=readingDocument();await load(page,text);
  await page.locator('#source').evaluate(node=>node.setSelectionRange(5,5));
  const normalized=text.replace(/\r\n/g,'\n');
  await scrollSourceTo(page,normalized.indexOf('## Part 18\n'));
  await expect.poll(()=>centreDistance(page,'#preview #part-18')).toBeLessThan(3);
  await scrollRenderedTo(page,'#preview #part-32 + p');
  const expected=normalized.slice(0,normalized.indexOf('Paragraph 32:')).split('\n').length-.5;
  await expect.poll(async()=>Math.abs(await centreLine(page)-expected)).toBeLessThan(.1);
  const before=await page.locator('#preview-pane').evaluate(node=>node.scrollTop);
  await page.waitForTimeout(180);
  expect(await page.locator('#preview-pane').evaluate(node=>node.scrollTop)).toBeCloseTo(before,0);
  expect(await page.locator('#source').evaluate(node=>node.selectionStart)).toBe(5);
  expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe(text);
});
test('source and rendered navigation buttons reveal the selected location',async({page})=>{
  const text=readingDocument();await load(page,text);await page.locator('[data-mode=source]').click();
  const normalized=text.replace(/\r\n/g,'\n'),offset=normalized.indexOf('## Part 20\n');
  await page.locator('#source').evaluate((node,offset)=>node.setSelectionRange(offset,offset),offset);
  await page.locator('#show-preview').click();await expect(page.locator('#preview-pane')).toBeVisible();
  await expect.poll(()=>centreDistance(page,'#preview #part-20')).toBeLessThan(3);
  await page.locator('[data-mode=preview]').click();
  await page.locator('#preview #part-28 + p').click();await page.locator('#show-source').click();
  await expect(page.locator('#source')).toBeVisible();
  expect(await page.locator('#source').evaluate(node=>node.selectionStart)).toBe(normalized.indexOf('Paragraph 28:'));
  expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe(text);
});
test('right-click actions navigate source, preview and editable visual blocks',async({page})=>{
  const text=readingDocument(),normalized=text.replace(/\r\n/g,'\n');await load(page,text);
  await page.locator('[data-mode=source]').click();await scrollSourceTo(page,normalized.indexOf('## Part 16\n'));
  const rect=await page.locator('#source').boundingBox();
  await page.mouse.click(rect.x+60,rect.y+rect.height/2,{button:'right'});
  await expect(page.locator('#navigation-action')).toHaveText('Show in preview');await page.locator('#navigation-action').click();
  await expect.poll(()=>centreDistance(page,'#preview #part-16')).toBeLessThan(3);
  await page.locator('#preview #part-24').click({button:'right'});await page.locator('#navigation-action').click();
  expect(await page.locator('#source').evaluate(node=>node.selectionStart)).toBe(normalized.indexOf('## Part 24\n'));
  await page.locator('[data-mode=visual]').click();
  await page.locator('#visual #part-30 + p').click({button:'right'});await expect(page.locator('#navigation-action')).toHaveText('Show in source');await page.locator('#navigation-action').click();
  expect(await page.locator('#source').evaluate(node=>node.selectionStart)).toBe(normalized.indexOf('Paragraph 30:'));
  expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe(text);
});
test('mode switches carry the reading anchor in both directions including visual',async({page})=>{
  const text=readingDocument(),normalized=text.replace(/\r\n/g,'\n');await load(page,text);
  await scrollSourceTo(page,normalized.indexOf('## Part 22\n'));
  await expect.poll(()=>centreDistance(page,'#preview #part-22')).toBeLessThan(3);
  await page.locator('[data-mode=visual]').click();await expect.poll(()=>centreDistance(page,'#visual #part-22','#visual-pane')).toBeLessThan(3);
  await scrollRenderedTo(page,'#visual #part-34','#visual-pane');
  await page.locator('[data-mode=source]').click();
  const expected=normalized.slice(0,normalized.indexOf('## Part 34\n')).split('\n').length-.5;
  await expect.poll(async()=>Math.abs(await centreLine(page)-expected)).toBeLessThan(.1);
  await page.locator('[data-mode=preview]').click();await expect.poll(()=>centreDistance(page,'#preview #part-34')).toBeLessThan(3);
  expect(await page.evaluate(()=>window.editor.snapshot().source)).toBe(text);
});
test('linked scrolling can be disabled persistently and re-enabled from either pane',async({page})=>{
  const text=readingDocument(),normalized=text.replace(/\r\n/g,'\n');await load(page,text);
  await page.locator('#link-scrolling').uncheck();
  const before=await page.locator('#preview-pane').evaluate(node=>node.scrollTop);
  await scrollSourceTo(page,normalized.indexOf('## Part 19\n'));await page.waitForTimeout(120);
  expect(await page.locator('#preview-pane').evaluate(node=>node.scrollTop)).toBe(before);
  await page.reload();await expect(page.locator('#link-scrolling')).not.toBeChecked();await load(page,text);
  await scrollRenderedTo(page,'#preview #part-26');await page.waitForTimeout(120);
  const sourceBefore=await page.locator('#source').evaluate(node=>node.scrollTop);expect(sourceBefore).toBe(0);
  await page.locator('#link-scrolling').check();
  const expected=normalized.slice(0,normalized.indexOf('## Part 26\n')).split('\n').length-.5;
  await expect.poll(async()=>Math.abs(await centreLine(page)-expected)).toBeLessThan(.1);
});
test('multiline code and table mappings follow their source ranges',async({page})=>{
  const text=readingDocument(),normalized=text.replace(/\r\n/g,'\n');await load(page,text);
  const codeOffset=normalized.indexOf('const second = first + 1;',normalized.indexOf('## Part 23\n'));
  await scrollSourceTo(page,codeOffset);
  const code=page.locator('#preview [data-kind=fence]').nth(23),rect=await code.boundingBox(),pane=await page.locator('#preview-pane').boundingBox();
  await expect.poll(async()=>{
    const r=await code.boundingBox();return Math.max(r.y-(pane.y+pane.height/2),(pane.y+pane.height/2)-(r.y+r.height));
  }).toBeLessThan(1);
  expect(rect.height).toBeGreaterThan(30);
  const tableOffset=normalized.indexOf('| Feature | Status |',normalized.indexOf('## Part 31\n'));
  await scrollSourceTo(page,tableOffset);await expect.poll(()=>page.locator('#preview table').nth(31).evaluate(node=>{
    const block=node.getBoundingClientRect(),pane=document.querySelector('#preview-pane').getBoundingClientRect(),middle=(pane.top+pane.bottom)/2;
    return Math.max(block.top-middle,middle-block.bottom);
  })).toBeLessThan(1);
});
test('asynchronous layout changes keep the source anchor aligned',async({page})=>{
  const text=readingDocument(),normalized=text.replace(/\r\n/g,'\n');await load(page,text);
  await scrollSourceTo(page,normalized.indexOf('## Part 21\n'));await expect.poll(()=>centreDistance(page,'#preview #part-21')).toBeLessThan(3);
  await page.locator('#preview [data-kind=fence]').first().evaluate(node=>node.style.height='650px');
  await expect.poll(()=>centreDistance(page,'#preview #part-21')).toBeLessThan(3);
});
test('server preview disables unsupported source mapping and offline restores it',async({page})=>{
  await load(page,readingDocument());await page.evaluate(()=>window.editor.remoteHTML('<h1>Server content without source positions</h1>'));
  await expect(page.locator('#show-source')).toBeDisabled();await expect(page.locator('#link-scrolling')).toBeDisabled();
  await page.locator('#offline-preview').click();await expect(page.locator('#show-source')).toBeEnabled();await expect(page.locator('#link-scrolling')).toBeEnabled();
});
