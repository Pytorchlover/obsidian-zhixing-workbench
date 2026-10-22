'use strict';
const assert=require('node:assert/strict'),{EventEmitter}=require('events');const {sseParser,streamChat}=require('../src/paper-stream'),core=require('../src/paper-core');
let count=0;const test=async(name,fn)=>{await fn();count++;};
const response=(text,finish='stop')=>'data: '+JSON.stringify({choices:[{delta:{content:text},finish_reason:finish}]})+'\n\n';
function mock(chunks,{status=200,hold=false}={}){return(url,opts,callback)=>{const req=new EventEmitter();req.destroy=()=>{};req.end=body=>{assert.equal(JSON.parse(body).stream,true);setTimeout(()=>{const res=new EventEmitter();res.statusCode=status;res.destroy=()=>{};res.resume=()=>{};callback(res);for(const chunk of chunks)res.emit('data',Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));if(!hold)res.emit('end');},0);};return req;};}
(async()=>{
 await test('SSE handles boundaries and multiline',()=>{const events=[],p=sseParser(x=>events.push(x));for(const x of ['data: a\r','\ndata: b\r\n\r','\n',': ping\n\n','data: [DONE]\n\n'])p.push(x);assert.deepEqual(events,['a\nb','[DONE]']);});
 await test('UTF8 and token deltas',async()=>{const bytes=Buffer.from(response('你好',null)+response('世界')+'data: [DONE]\n\n'),chunks=Array.from(bytes,b=>Buffer.from([b])),deltas=[];assert.equal(await streamChat({key:'test',model:'test',messages:[],request:mock(chunks),onDelta:x=>deltas.push(x)}),'你好世界');assert.deepEqual(deltas,['你好','世界']);});
 await test('real abort retains partial',async()=>{const controller=new AbortController();await assert.rejects(streamChat({key:'test',model:'test',messages:[],request:mock([response('部分',null)],{hold:true}),signal:controller.signal,onDelta:()=>controller.abort()}),e=>e.name==='AbortError'&&e.partial==='部分');});
 await test('truncation and broken stream',async()=>{for(const end of ['length',null])await assert.rejects(streamChat({key:'test',model:'test',messages:[],request:mock([response('部分',end)])}),e=>e.partial==='部分');});
 await test('safe HTTP error',async()=>{await assert.rejects(streamChat({key:'private-key',model:'test',messages:[],request:mock([],{status:401})}),e=>!e.message.includes('private-key')&&/密钥/.test(e.message));});
 await test('timeout',async()=>{await assert.rejects(streamChat({key:'test',model:'test',messages:[],request:mock([],{hold:true}),timeout:10}),/超时/);});
 await test('selection context remains local',()=>{const paper={pages:Array.from({length:20},(_,i)=>({paragraphs:['page '+i+' paragraph one','page '+i+' paragraph two']}))},quote={text:'page 7 paragraph one',page:8};const context=core.chatContext(paper,'解释',8,quote);assert.ok(context.length>0);assert.ok(context.every(b=>b.page===8));assert.ok(core.chatContext(paper,'全文',8,quote,'paper').some(b=>b.page!==8));});
 console.log(`PASS: ${count} streaming and context checks`);
})().catch(e=>{console.error(e);process.exit(1);});
