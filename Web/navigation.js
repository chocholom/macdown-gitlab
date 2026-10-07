// Reading positions use source lines, not percentages of the whole document:
// a diagram or long wrapped paragraph can have a very different rendered height.
const clamp = (value,min,max) => Math.min(max,Math.max(min,value));

export class SourceLines {
  constructor(source) {
    this.source=source; this.starts=[0];
    for(const match of source.matchAll(/\r\n|\r|\n/g)) this.starts.push(match.index+match[0].length);
  }
  lineAt(offset) {
    offset=clamp(offset,0,this.source.length);
    let low=0,high=this.starts.length;
    while(low+1<high) { const mid=(low+high)>>1; if(this.starts[mid]<=offset) low=mid; else high=mid; }
    return low;
  }
  offsetAt(line) { return this.starts[clamp(Math.floor(line),0,this.starts.length-1)]; }
  range(start,end) {
    // Parser ranges include the last newline. It belongs to the preceding line.
    return [this.lineAt(start),Math.max(this.lineAt(start)+1,this.lineAt(Math.max(start,end-1))+1)];
  }
}

// A block is {startLine,endLine,top,bottom}, in pane scroll coordinates.
// Ignore invisible blocks and prefer the most specific nested mapping.
function project(blocks,value,fromStart,fromEnd,toStart,toEnd) {
  blocks=blocks.filter(b=>b.bottom>b.top && b.endLine>b.startLine);
  if(!blocks.length) return null;
  const inside=blocks.filter(b=>value>=b[fromStart] && value<b[fromEnd])
    .sort((a,b)=>(a[fromEnd]-a[fromStart])-(b[fromEnd]-b[fromStart]) || (a[toEnd]-a[toStart])-(b[toEnd]-b[toStart]));
  if(inside.length) {
    const b=inside[0],fraction=(value-b[fromStart])/(b[fromEnd]-b[fromStart]);
    return b[toStart]+fraction*(b[toEnd]-b[toStart]);
  }
  const before=blocks.filter(b=>b[fromEnd]<=value).sort((a,b)=>b[fromEnd]-a[fromEnd] || b[toEnd]-a[toEnd])[0];
  const after=blocks.filter(b=>b[fromStart]>value).sort((a,b)=>a[fromStart]-b[fromStart] || a[toStart]-b[toStart])[0];
  if(!before) return after[toStart];
  if(!after) return before[toEnd];
  const fraction=(value-before[fromEnd])/(after[fromStart]-before[fromEnd]);
  return before[toEnd]+fraction*(after[toStart]-before[toEnd]);
}
export const renderedPoint = (blocks,line) => project(blocks,line,'startLine','endLine','top','bottom');
export const sourceLine = (blocks,y) => project(blocks,y,'top','bottom','startLine','endLine');
