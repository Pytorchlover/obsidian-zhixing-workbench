'use strict';
const assert=require('node:assert/strict');
const {renderNav}=require('../src/sidebar-nav');
const expected=['工作台','每日记录','论文','每日推荐','知识沉淀','项目空间','知识索引'];
let checks=0;
(async()=>{
 for(const active of ['desk','daily','papers','recommend','distill','projects','knowledge']){
  const attrs={},nav={setAttribute:(k,v)=>attrs[k]=v},items=[],calls=[];
  const plugin={openDesk:()=>calls.push('desk'),openDaily:()=>calls.push('daily'),openPapers:()=>calls.push('papers'),openRecommendations:()=>calls.push('recommend'),openKnowledge:()=>calls.push('distill'),openDirectory:path=>calls.push(path)};
  const make=(parent,label,cls,click,icon)=>{const b={label,cls,click,icon,dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;}};items.push(b);return b;};
  const buttons=renderNav(nav,plugin,make,{active});
  assert.deepEqual(items.map(b=>b.label),expected);assert.equal(items.filter(b=>b.cls==='zd-nav-active').length,1);assert.equal(buttons[active].attrs['aria-current'],'page');assert.equal(attrs['aria-label'],'个人空间导航');
  for(const b of items)await b.click();assert.deepEqual(calls,['desk','daily','papers','recommend','distill','项目总览','wiki/index.md']);checks++;
 }
 const items=[],nav={setAttribute(){}},calls=[];renderNav(nav,{},(_,label,cls,click)=>{const b={dataset:{},setAttribute(){},click};items.push(b);return b;},{active:'desk',actions:{desk:()=>calls.push('today')},run:async fn=>{calls.push('guard');await fn();}});await items[0].click();assert.deepEqual(calls,['guard','today']);checks++;
 console.log(`PASS: ${checks} consistent sidebar destinations, active state and guarded routing checks`);
})().catch(e=>{console.error(e);process.exit(1);});
