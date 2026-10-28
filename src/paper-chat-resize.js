'use strict';
const DEFAULT_WIDTH=340;
function limits(total){return {min:280,max:Math.max(280,Math.min(760,Math.floor(total-360))) };}
function clamp(width,total){const {min,max}=limits(total);return Math.max(min,Math.min(max,Number.isFinite(width)?width:DEFAULT_WIDTH));}
function mountChatResize({grid,wrap,initial,onSave,onError=()=>{}}){
 const doc=grid.ownerDocument,handle=doc.createElement('div');handle.className='zd-chat-resize';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label','调整 AI 对话栏宽度');handle.title='左右拖动调整宽度；双击恢复默认';wrap.appendChild(handle);
 let preferred=Number.isFinite(initial)?initial:DEFAULT_WIDTH,width,drag=null;
 const update=()=>{width=clamp(preferred,grid.clientWidth);grid.style.setProperty('--zd-chat-width',width+'px');const {min,max}=limits(grid.clientWidth);for(const [k,v]of Object.entries({min,max,now:width}))handle.setAttribute('aria-valu'+(k==='now'?'enow':k==='min'?'emin':'emax'),String(v));};
 const save=()=>Promise.resolve(onSave(preferred)).catch(onError);
 const down=e=>{if(e.button!==0)return;e.preventDefault();drag={x:e.clientX,width,id:e.pointerId};handle.setPointerCapture(e.pointerId);grid.classList.add('is-chat-resizing');};
 const move=e=>{if(!drag||drag.id!==e.pointerId)return;preferred=clamp(drag.width+drag.x-e.clientX,grid.clientWidth);update();};
 const end=e=>{if(!drag||drag.id!==e.pointerId)return;drag=null;grid.classList.remove('is-chat-resizing');if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);save();};
 const key=e=>{const {min,max}=limits(grid.clientWidth);const next={ArrowLeft:width+20,ArrowRight:width-20,Home:min,End:max}[e.key];if(next===undefined)return;e.preventDefault();preferred=clamp(next,grid.clientWidth);update();save();};
 const reset=()=>{preferred=DEFAULT_WIDTH;update();save();};
 handle.addEventListener('pointerdown',down);handle.addEventListener('pointermove',move);for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(name,end);handle.addEventListener('keydown',key);handle.addEventListener('dblclick',reset);
 let frame=null,observedWidth=grid.clientWidth;const raf=doc.defaultView||globalThis;const observer=new ResizeObserver(()=>{if(grid.clientWidth===observedWidth)return;observedWidth=grid.clientWidth;if(frame===null)frame=raf.requestAnimationFrame(()=>{frame=null;update();});});observer.observe(grid);update();
 return{handle,dispose(){observer.disconnect();if(frame!==null)raf.cancelAnimationFrame(frame);drag=null;grid.classList.remove('is-chat-resizing');handle.removeEventListener('pointerdown',down);handle.removeEventListener('pointermove',move);for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.removeEventListener(name,end);handle.removeEventListener('keydown',key);handle.removeEventListener('dblclick',reset);handle.remove();}};
}
module.exports={mountChatResize,clamp,limits};
