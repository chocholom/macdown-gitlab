import { SourceLines,renderedPoint,sourceLine } from './navigation.js';
import { sourceOffset,textareaOffset } from './core.js';

export function readingNavigation({getSource,getMode,setMode,flush,isRemote}) {
  const $=id=>document.getElementById(id),source=$('source');
  const panes=[$('preview-pane'),$('visual-pane')];
  const guards=new WeakMap();
  let lines=new SourceLines(''),leader=source,anchor=0,frame=0,context=null,lastBlock=null;
  let linked=localStorage.getItem('linked-scrolling')!=='false';
  $('link-scrolling').checked=linked;
  function index() { const text=getSource(); if(lines.source!==text) lines=new SourceLines(text); return lines; }
  function metrics() { const style=getComputedStyle(source); return {padding:parseFloat(style.paddingTop),height:parseFloat(style.lineHeight)}; }
  function geometry(pane) {
    const origin=pane.getBoundingClientRect().top+pane.clientTop;
    return [...pane.querySelectorAll('.markdown [data-start]:not([data-kind=cell])')].map(node=>{
      const rect=node.getBoundingClientRect(),[startLine,endLine]=index().range(Number(node.dataset.start),Number(node.dataset.end));
      return {node,startLine,endLine,top:rect.top-origin+pane.scrollTop,bottom:rect.bottom-origin+pane.scrollTop};
    });
  }
  function read(pane) {
    if(pane===source) { const {padding,height}=metrics(); return Math.max(0,(source.scrollTop+source.clientHeight/2-padding)/height); }
    return sourceLine(geometry(pane),pane.scrollTop+pane.clientHeight/2) ?? anchor;
  }
  function scroll(pane,top) {
    top=Math.max(0,Math.min(top,pane.scrollHeight-pane.clientHeight));
    if(Math.abs(pane.scrollTop-top)<.5) return;
    guards.set(pane,top); pane.scrollTop=top;
    // WebKit rounds scroll positions on some displays.
    guards.set(pane,pane.scrollTop);
  }
  function align(pane,line) {
    if(!pane.clientHeight) return;
    if(pane===source) { const {padding,height}=metrics(); scroll(source,padding+line*height-source.clientHeight/2); }
    else { const y=renderedPoint(geometry(pane),line); if(y!==null) scroll(pane,y-pane.clientHeight/2); }
  }
  function renderedPane() { return getMode()==='visual' ? panes[1] : panes[0]; }
  function capture() {
    if(!leader.clientHeight) leader=getMode()==='source' || getMode()==='split' ? source : renderedPane();
    if(!isRemote()) anchor=read(leader);
    return anchor;
  }
  function follow() {
    if(!linked || isRemote() || getMode()!=='split') return;
    align(leader===source ? panes[0] : source,anchor);
  }
  function changed(pane) {
    if(!pane.clientHeight || isRemote()) return;
    const guard=guards.get(pane); guards.delete(pane);
    if(guard!==undefined && Math.abs(pane.scrollTop-guard)<1) return;
    leader=pane; anchor=read(pane);
    cancelAnimationFrame(frame); frame=requestAnimationFrame(follow);
  }
  for(const pane of [source,...panes]) pane.addEventListener('scroll',()=>changed(pane),{passive:true});
  $('link-scrolling').onchange=()=>{linked=$('link-scrolling').checked;localStorage.setItem('linked-scrolling',String(linked));capture();follow();};
  function controls() {
    const disabled=isRemote();
    for(const id of ['link-scrolling','show-source','show-preview']) {
      $(id).disabled=disabled;
      $(id).title=disabled ? 'Return to offline preview to use source mapping' : ({'link-scrolling':'Keep the middle of source and preview together','show-source':'Show the selected rendered block in source','show-preview':'Show the source caret in preview'})[id];
    }
    $('show-preview').hidden=getMode()==='preview' || getMode()==='visual';
    $('show-source').hidden=getMode()==='source';
  }
  function selectionOffset() {
    const selection=window.getSelection();
    const node=selection?.anchorNode;
    const block=(node?.nodeType===Node.ELEMENT_NODE ? node : node?.parentElement)?.closest('[data-start]');
    if(block && renderedPane().contains(block)) return Number(block.dataset.start);
    if(lastBlock?.isConnected && renderedPane().contains(lastBlock)) return Number(lastBlock.dataset.start);
    return index().offsetAt(read(renderedPane()));
  }
  function showSource(offset=selectionOffset()) {
    if(isRemote()) return;
    flush(); if(getMode()!=='split' && getMode()!=='source') setMode('split');
    const line=index().lineAt(offset); anchor=line+.5;leader=source;
    align(source,anchor);align(panes[0],anchor);
    source.focus({preventScroll:true});const caret=textareaOffset(getSource(),offset);source.setSelectionRange(caret,caret);
    $('position').textContent='Line '+(line+1);
  }
  function showPreview(offset) {
    if(isRemote()) return;
    const line=index().lineAt(offset);flush();if(getMode()!=='split') setMode('split');
    anchor=line+.5;leader=source;align(source,anchor);align(panes[0],anchor);
    const mapped=geometry(panes[0]).filter(b=>line>=b.startLine&&line<b.endLine).sort((a,b)=>(a.endLine-a.startLine)-(b.endLine-b.startLine))[0]?.node;
    if(mapped) { mapped.classList.remove('navigation-target');void mapped.offsetWidth;mapped.classList.add('navigation-target');setTimeout(()=>mapped.classList.remove('navigation-target'),1500); }
    panes[0].focus({preventScroll:true});
  }
  $('show-preview').onclick=()=>showPreview(sourceOffset(getSource(),source.selectionStart));
  $('show-source').onclick=()=>showSource();
  for(const id of ['show-source','show-preview']) $(id).addEventListener('mousedown',event=>event.preventDefault());
  function hideMenu() { $('navigation-menu').hidden=true;context=null; }
  function openMenu(event,action,offset) {
    if(isRemote()) return;
    event.preventDefault();context={action,offset};
    $('navigation-action').textContent=action==='source' ? 'Show in source' : 'Show in preview';
    const menu=$('navigation-menu');menu.hidden=false;
    menu.style.left=Math.max(0,Math.min(event.clientX,window.innerWidth-menu.offsetWidth-8))+'px';
    menu.style.top=Math.max(0,Math.min(event.clientY,window.innerHeight-menu.offsetHeight-8))+'px';
    $('navigation-action').focus({preventScroll:true});
  }
  source.addEventListener('contextmenu',event=>{
    const {padding,height}=metrics(),rect=source.getBoundingClientRect();
    const line=Math.max(0,(event.clientY-rect.top+source.scrollTop-padding)/height);
    openMenu(event,'preview',index().offsetAt(line));
  });
  for(const pane of panes) {
    pane.addEventListener('click',event=>{lastBlock=event.target.closest('[data-start]');});
    pane.addEventListener('contextmenu',event=>{
      const block=event.target.closest('[data-start]');
      const offset=block ? Number(block.dataset.start) : index().offsetAt(read(pane));
      openMenu(event,'source',offset);
    });
  }
  $('navigation-action').onclick=()=>{const item=context;hideMenu();if(item) item.action==='source' ? showSource(item.offset) : showPreview(item.offset);};
  document.addEventListener('pointerdown',event=>{if(!$('navigation-menu').contains(event.target))hideMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && !$('navigation-menu').hidden){event.preventDefault();hideMenu();leader.focus({preventScroll:true});}});
  window.addEventListener('blur',hideMenu);
  const resize=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(follow);});
  for(const element of [source,...panes,$('preview'),$('visual')]) resize.observe(element);
  return {
    capture,showSource,controls,
    restore(line) { anchor=line;leader=getMode()==='preview' || getMode()==='visual' ? renderedPane() : source;align(source,line);align(renderedPane(),line);controls(); },
    reset() { cancelAnimationFrame(frame);hideMenu();anchor=0;leader=source;lastBlock=null;for(const pane of [source,...panes])scroll(pane,0);controls(); },
    refresh() {controls();cancelAnimationFrame(frame);frame=requestAnimationFrame(follow);}
  };
}
