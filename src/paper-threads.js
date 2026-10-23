'use strict';
const {randomUUID}=require('crypto');
// The original chat is immutable during migration. Each paper owns its own repository.
function ensure(paper){
 if(paper.assistantChat?.version===1)return paper.assistantChat;
 if(paper.assistantChat)throw Error('会话数据版本较新，请更新工作台后再打开。');
 const messages=(paper.chat||[]).map((m,i)=>({parentId:i?'legacy-'+(i-1):null,message:{id:'legacy-'+i,role:m.role,content:[{type:'text',text:m.text||''}],createdAt:m.at||new Date(0).toISOString(),...(m.role==='assistant'?{status:m.status==='error'||m.status==='cancelled'?{type:'incomplete',reason:m.status==='error'?'error':'cancelled',...(m.error?{error:m.error}:{})}:{type:'complete',reason:'stop'}}:{}),metadata:{custom:{refs:m.refs||[],selection:m.selection||null,scope:m.scope||'paper',insufficient:!!m.insufficient}}}}));
 return paper.assistantChat={version:1,activeId:'legacy',threads:[{id:'legacy',title:messages.length?'原有对话':'默认会话',created:new Date().toISOString(),draft:paper.chatDraft||'',repository:{headId:messages.at(-1)?.message.id||null,messages}}]};
}
function thread(paper,id){const t=ensure(paper).threads.find(t=>t.id===id);if(!t)throw Error('会话不存在，请重新打开论文。');return t;}
function upsert(paper,id,item){const t=thread(paper,id),items=t.repository.messages,index=items.findIndex(x=>x.message.id===item.message.id);const copy=JSON.parse(JSON.stringify(item));if(index<0)items.push(copy);else items[index]=copy;t.repository.headId=item.message.id;t.updated=new Date().toISOString();if(t.title==='新会话'&&item.message.role==='user')t.title=item.message.content.filter(p=>p.type==='text').map(p=>p.text).join('').slice(0,24)||'新会话';}
function createStore(svc,paperId){
 const change=fn=>svc.update(paperId,p=>fn(ensure(p),p));
 return {
  async init(){const p=await svc.load(paperId);if(!p.assistantChat)await change(()=>{});return this.list();},
  async list(){return ensure(await svc.load(paperId));},
  async create(){const id=randomUUID();await change(state=>{state.threads.push({id,title:'新会话',created:new Date().toISOString(),draft:'',repository:{headId:null,messages:[]}});state.activeId=id;});return id;},
  async activate(id){await change((s,p)=>{thread(p,id);s.activeId=id;});},
  async rename(id,title){await change((s,p)=>thread(p,id).title=title.trim().slice(0,40)||'新会话');},
  async draft(id,text){await change((s,p)=>thread(p,id).draft=text);},
  async get(id){return thread(await svc.load(paperId),id);},
  async append(id,item){await change((s,p)=>upsert(p,id,item));},
  async head(id,headId){await change((s,p)=>{const t=thread(p,id);if(headId===null||t.repository.messages.some(x=>x.message.id===headId))t.repository.headId=headId;});}
 };
}
module.exports={ensure,thread,upsert,createStore};
