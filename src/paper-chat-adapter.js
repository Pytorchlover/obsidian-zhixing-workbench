'use strict';
const textOf=m=>typeof m.content==='string'?m.content:(m.content||[]).filter(p=>p.type==='text').map(p=>p.text).join('\n');
function modelAdapter({svc,paper,context,onBusy,initial=[]}){
 const contexts=new Map(initial.filter(i=>i.message.role==='user').map(i=>[i.message.id,i.message.metadata?.custom||{}]));
 return {async *run({messages,abortSignal}){
  const user=messages.at(-1),question=textOf(user);
  const saved=contexts.get(user.id)||{selection:context.selection,scope:context.scope};contexts.set(user.id,saved);
  const selected=saved.selection||null,scope=selected&&saved.scope!=='paper'?'selection':'paper';
  let full='',done=false,result,waiter;
  const wake=()=>{waiter?.();waiter=null;};
  onBusy(true);
  const task=Promise.resolve().then(()=>svc.chat(paper.id,question,context.page(),selected,{scope,signal:abortSignal,persist:false,history:messages.slice(0,-1).map(m=>({role:m.role,text:textOf(m),selection:m.metadata?.custom?.selection||contexts.get(m.id)?.selection||null,status:m.status?.type==='incomplete'?'error':'complete'})),onDelta:(_,value)=>{full=value;wake();}})).then(value=>{result=value;},error=>{result={status:abortSignal.aborted?'cancelled':'error',error:error.message,message:{text:full,refs:[]}};}).finally(()=>{done=true;wake();});
  try{
   while(!done){await new Promise(resolve=>{waiter=resolve;if(done)wake();});if(!done&&full)yield {content:[{type:'text',text:full}],metadata:{custom:{selection:selected,scope}}};}
   await task;
   const answer=result.message||{text:full,refs:[]};
   yield {content:[{type:'text',text:answer.text||''}],status:result.status==='complete'?{type:'complete',reason:'stop'}:{type:'incomplete',reason:result.status==='cancelled'?'cancelled':'error',...(result.error?{error:result.error}:{})},metadata:{custom:{refs:answer.refs||[],selection:selected,scope,insufficient:answer.insufficient||false,error:result.error||null}}};
  }finally{onBusy(false);}
 }};
}
module.exports={modelAdapter,textOf};
