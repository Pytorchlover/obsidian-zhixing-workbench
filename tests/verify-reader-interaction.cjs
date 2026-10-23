'use strict';
const assert=require('node:assert/strict');
const {bindPan}=require('../src/paper-reader');
let count=0;
function surface(){const node=new EventTarget(),doc=new EventTarget(),win=new EventTarget(),classes=new Set(),captures=new Set();node.ownerDocument=doc;doc.defaultView=win;node.scrollLeft=300;node.scrollTop=200;node.classList={toggle:(c,on)=>on?classes.add(c):classes.delete(c),remove:(...names)=>names.forEach(c=>classes.delete(c))};node.setPointerCapture=id=>captures.add(id);node.hasPointerCapture=id=>captures.has(id);node.releasePointerCapture=id=>captures.delete(id);node.focus=()=>{};const event=(target,type,data={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,{button:0,pointerId:1,clientX:200,clientY:200,code:'',...data});target.dispatchEvent(e);return e;};return{node,doc,win,classes,captures,event};}
{
 const {node,event}=surface(),pan=bindPan(node);event(node,'pointerdown');event(node,'pointermove',{clientX:100,clientY:100});assert.equal(node.scrollLeft,300);assert.equal(node.scrollTop,200);pan.dispose();count++;
}
{
 const {node,event,classes,captures}=surface(),pan=bindPan(node,'hand');assert.ok(classes.has('is-hand-tool'));assert.ok(event(node,'pointerdown').defaultPrevented);assert.ok(captures.has(1));event(node,'pointermove',{clientX:100,clientY:150});assert.equal(node.scrollLeft,400);assert.equal(node.scrollTop,250);assert.ok(classes.has('is-panning'));event(node,'pointerup');assert.equal(captures.size,0);assert.ok(!classes.has('is-panning'));event(node,'pointermove',{clientX:0});assert.equal(node.scrollLeft,400);pan.dispose();count++;
}
{
 const {node,event,doc,win,classes}=surface(),pan=bindPan(node);event(node,'keydown',{code:'Space'});assert.ok(pan.isPanning());event(node,'pointerdown');event(node,'pointermove',{clientX:250,clientY:100});assert.equal(node.scrollLeft,250);assert.equal(node.scrollTop,300);event(doc,'keyup',{code:'Space'});assert.ok(!pan.isPanning());pan.setTool('hand');event(node,'pointerdown');event(win,'blur');assert.ok(!classes.has('is-panning'));event(node,'pointerdown');event(node,'pointercancel');assert.ok(!classes.has('is-panning'));pan.setTool('select');assert.ok(!classes.has('is-hand-tool'));pan.dispose();event(node,'keydown',{code:'Space'});assert.ok(!classes.has('is-hand-tool'));count++;
}
{
 const {node,event}=surface(),pan=bindPan(node,'hand');event(node,'pointerdown',{button:2});event(node,'pointermove',{clientX:0});assert.equal(node.scrollLeft,300);event(node,'pointerdown');event(node,'pointermove',{pointerId:2,clientX:0});assert.equal(node.scrollLeft,300);pan.dispose();count++;
}
console.log(`PASS: ${count} PDF selection, hand pan, temporary space pan and cleanup checks`);
