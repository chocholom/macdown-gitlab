import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceLines,renderedPoint,sourceLine } from '../Web/navigation.js';

test('line index preserves UTF-16 offsets and mixed line endings',()=>{
  const lines=new SourceLines('😀 first\r\nsecond\nthird\rlast');
  assert.deepEqual(lines.starts,[0,10,17,23]);
  for(const [offset,line] of [[-8,0],[0,0],[8,0],[9,0],[10,1],[16,1],[17,2],[22,2],[23,3],[999,3]]) assert.equal(lines.lineAt(offset),line);
  assert.equal(lines.offsetAt(-1),0);assert.equal(lines.offsetAt(1.8),10);assert.equal(lines.offsetAt(99),23);
  assert.deepEqual(lines.range(10,17),[1,2]);assert.deepEqual(lines.range(0,23),[0,3]);
  assert.deepEqual(lines.range(23,27),[3,4]);assert.deepEqual(lines.range(10,10),[1,2]);
});
test('empty and trailing-empty source lines are bounded',()=>{
  const empty=new SourceLines('');assert.equal(empty.lineAt(99),0);assert.equal(empty.offsetAt(99),0);assert.deepEqual(empty.range(0,0),[0,1]);
  const lines=new SourceLines('one\n');assert.equal(lines.lineAt(4),1);assert.equal(lines.offsetAt(1),4);assert.deepEqual(lines.range(0,4),[0,1]);
});
const blocks=[{startLine:2,endLine:3,top:100,bottom:140},{startLine:5,endLine:15,top:200,bottom:800},{startLine:20,endLine:22,top:900,bottom:950}];
test('source centre maps by block rather than document percentage',()=>{
  assert.equal(renderedPoint(blocks,2.5),120);assert.equal(renderedPoint(blocks,10),500);assert.equal(renderedPoint(blocks,21),925);
});
test('rendered centre maps back through multiline code and wrapped paragraphs',()=>{
  assert.equal(sourceLine(blocks,120),2.5);assert.equal(sourceLine(blocks,500),10);assert.equal(sourceLine(blocks,925),21);
});
test('blank lines and rendered margins interpolate between neighbouring blocks',()=>{
  assert.equal(renderedPoint(blocks,4),170);assert.equal(sourceLine(blocks,170),4);
  assert.equal(renderedPoint(blocks,17.5),850);assert.equal(sourceLine(blocks,850),17.5);
});
test('unrendered front matter, document boundaries and zero-size blocks are safe',()=>{
  const hidden={startLine:0,endLine:2,top:0,bottom:0};
  assert.equal(renderedPoint([hidden,...blocks],0),100);assert.equal(renderedPoint(blocks,99),950);
  assert.equal(sourceLine(blocks,0),2);assert.equal(sourceLine(blocks,999),22);
  assert.equal(sourceLine([hidden],0),null);assert.equal(renderedPoint([],0),null);
  assert.equal(renderedPoint([{startLine:0,endLine:0,top:0,bottom:10}],0),null);
});
test('nested list and quote mappings choose the most specific block',()=>{
  const nested=[{startLine:0,endLine:20,top:0,bottom:1000},{startLine:5,endLine:7,top:200,bottom:260},{startLine:5,endLine:7,top:205,bottom:255}];
  assert.equal(renderedPoint(nested,6),230);assert.equal(sourceLine(nested,230),6);
  assert.equal(renderedPoint(nested,6.5),242.5);assert.equal(sourceLine(nested,242.5),6.5);
});
test('shared boundaries select the following block and tie-breaking is deterministic',()=>{
  const adjacent=[{startLine:0,endLine:1,top:10,bottom:30},{startLine:1,endLine:2,top:30,bottom:80}];
  assert.equal(renderedPoint(adjacent,1),30);assert.equal(sourceLine(adjacent,30),1);
  const tied=[{startLine:0,endLine:2,top:10,bottom:30},{startLine:0,endLine:1,top:10,bottom:30}];
  assert.equal(sourceLine(tied,20),.5);
});
