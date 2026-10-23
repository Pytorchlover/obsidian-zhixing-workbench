'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const core=require('../src/paper-core'),arxiv=require('../src/arxiv');
function fixture({broken=false}={}){
 const files=new Map(),calls=[],writes=[],module={exports:{}};let parses=0;
 const buffer=Uint8Array.from(Buffer.from('%PDF-1.7\nfixture-public-paper')).buffer;
 const vault={getAbstractFileByPath:p=>files.has(p)?{path:p}:null,getFiles:()=>[...files.keys()].map(path=>({path})),read:async f=>files.get(f.path),cachedRead:async f=>files.get(f.path),readBinary:async f=>files.get(f.path),create:async(p,text)=>{if(files.has(p))throw Error('exists');files.set(p,text);writes.push(p);return{path:p};},createBinary:async(p,data)=>{if(files.has(p))throw Error('exists');files.set(p,data);writes.push(p);return{path:p};},process:async(f,fn)=>{files.set(f.path,fn(files.get(f.path)));}};
 const document={numPages:2,getMetadata:async()=>({info:{}}),getPage:async n=>{if(broken)throw Error('invalid PDF');return{getTextContent:async()=>({items:[{str:'Public paper text for page '+n,transform:[1,0,0,12,20,200],width:200,height:12}]}),getViewport:()=>({width:600}),cleanup:()=>{}};},destroy:async()=>{}};
 const mock={requestUrl:async options=>{calls.push(options.url);return{status:200,arrayBuffer:buffer};},loadPdfJs:async()=>({getDocument:()=>{parses++;return{promise:Promise.resolve(document)};}}),moment:()=>({format:()=> '2026-10-23'})};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/paper-service.js'),'utf8'),{module,require:n=>n==='obsidian'?mock:n==='./paper-core'?core:n==='./arxiv'?arxiv:n==='./paper-stream'?{}:n==='./paper-layout'?()=>({}):require(n),Buffer,Uint8Array,Map,Set,Promise,setTimeout,clearTimeout,AbortController,structuredClone,DOMParser:class{constructor(){throw Error('metadata should avoid HTML request');}}});
 const svc=module.exports({app:{vault},ensureFolders:async()=>{},register:()=>{}});
 return{svc,files,writes,calls,get parses(){return parses;}};
}
const meta={id:'2410.24164v1',title:'A public VLA paper',authors:'Author One',abstract:'Stored abstract',categories:['cs.RO'],published:'2024-10-31',updated:'2024-10-31',doi:''};
(async()=>{
 let n=0;
 const f=fixture(),[a,b]=await Promise.all([f.svc.importArxiv(meta.id,()=>{},meta),f.svc.importArxiv(meta.id,()=>{},meta)]);
 assert.equal(a.id,b.id);assert.equal(f.calls.length,1);assert.equal(f.parses,1);assert.equal(a.pages.length,2);assert.equal(a.arxiv.abstract,'Stored abstract');assert.equal(a.source,'https://arxiv.org/abs/'+meta.id);assert.ok(f.files.has(a.pdfPath));assert.ok(f.files.has(core.ROOT+'/'+a.id+'/paper.json'));assert.equal(f.writes.length,2);n++;
 await f.svc.update(a.id,p=>{p.chat.push({role:'user',text:'keep my notes'});p.category='VLA';p.summary={overview:'Keep summary'};});
 const originalPdf=f.files.get(a.pdfPath),next=await f.svc.importArxiv('2410.24164v2');assert.equal(next.id,a.id);assert.equal(f.calls.length,1);assert.equal(next.chat[0].text,'keep my notes');assert.equal(next.summary.overview,'Keep summary');assert.equal(next.category,'VLA');assert.equal(f.files.get(a.pdfPath),originalPdf);n++;
 const records=await f.svc.list();assert.equal(records.length,1);assert.equal(records[0].arxivId,meta.id);assert.equal(records[0].pages,2);n++;
 f.files.delete(a.pdfPath);const repaired=await f.svc.importArxiv(meta.id,()=>{},meta);assert.ok(f.files.has(a.pdfPath));assert.equal(repaired.chat[0].text,'keep my notes');assert.equal(f.parses,1);n++;
 const broken=fixture({broken:true});await assert.rejects(broken.svc.importArxiv(meta.id,()=>{},meta),/invalid PDF/);assert.equal(broken.files.size,0);n++;
 await assert.rejects(f.svc.importArxiv('https://evil.invalid/2410.24164'),/arXiv/);assert.equal(f.calls.length,2);n++;
 console.log(`PASS: ${n} arXiv local archive, concurrent import, deduplication and recovery checks`);
})().catch(e=>{console.error(e);process.exitCode=1;});
