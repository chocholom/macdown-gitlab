import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {render} from '../Web/core.js';
const examples=JSON.parse(readFileSync(new URL('./commonmark-0.31.2.json',import.meta.url),'utf8'));
// Application heading anchors and fence wrappers do not alter Markdown semantics.
// Remove only those known application additions; retain all actual spec output.
function canonical(html) {
  return html.replace(/<h([1-6]) id="[^"]*">/g,'<h$1>')
    .replace(/<div>(<pre>[\s\S]*?<\/pre>\n)<\/div>/g,'$1');
}
for(const example of examples) test(`CommonMark 0.31.2 example ${example.example}: ${example.section}`,()=>{
  assert.equal(canonical(render(example.markdown,'commonmark',{mapped:false}).html),example.html);
});
