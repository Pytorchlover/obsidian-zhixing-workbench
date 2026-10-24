'use strict';
const c=require('./knowledge-core'),paperCore=require('./paper-core');
const dated=value=>{const d=new Date(value||0);return Number.isFinite(d.getTime())?c.local(d).day:'';};
const within=(day,p)=>day>=p.start&&day<=p.end;
const allowed=path=>(path.startsWith('wiki/')||path.startsWith('projects/'))&&path.endsWith('.md')&&!path.startsWith(c.ROOT+'/')&&!path.startsWith('wiki/reviews/')&&!path.startsWith('projects/个人工作台/论文库/')&&!['wiki/index.md','wiki/log.md'].includes(path)&&!path.includes('/plugin/')&&!path.includes('/设计预览/')&&!path.endsWith('/设计说明.md')&&!path.endsWith(' MOC.md');
async function collect(plugin,svc,p,{paperId,selection,maxSources=24}={}){
 const vault=plugin.app.vault,all=[],targets=vault.getMarkdownFiles().filter(f=>c.validTarget(f.path)).map(f=>f.path).sort();let budget=48000,total=0;
 const add=(source,content)=>{total++;if(all.length>=maxSources||budget<300)return;const text=String(content).slice(0,Math.min(5000,budget));budget-=text.length;all.push({...source,id:'s'+(all.length+1),text,truncated:text.length<String(content).length});};

 const papers=paperId?[{id:paperId}]:await svc.list();
 for(const record of papers){const paper=await svc.load(record.id),messages=(paper.assistantChat?.threads||[]).flatMap(t=>t.repository.messages.map(i=>i.message)).filter(m=>within(dated(m.createdAt),p)),oldChat=(paper.chat||[]).filter(m=>within(dated(m.at),p));
  const summarizeAt=paper.summaryAt?dated(paper.summaryAt):'',read=(paper.readDays||[]).some(day=>within(day,p));
  if(!paperId&&!messages.length&&!oldChat.length&&!read&&!within(summarizeAt,p))continue;
  if(!paperId&&paper.status==='unread'&&!messages.length&&!oldChat.length&&!summarizeAt)continue;
  const summary=paper.summary,refs=new Set([...(summary?.overviewRefs||[]),...['problem','method','findings','limitations'].flatMap(k=>(summary?.[k]||[]).flatMap(x=>x.refs||[])),...messages.flatMap(m=>m.metadata?.custom?.refs||[]),...oldChat.flatMap(m=>m.refs||[])]);
  let excerpts=paperCore.blocks(paper).filter(b=>refs.has(b.id));if(selection)excerpts=paperCore.blocks(paper).filter(b=>b.page===selection.page);if(!excerpts.length&&paperId)excerpts=paperCore.blocks(paper).filter(b=>b.page===1);
  const evidence=excerpts.slice(0,5).map(b=>`[${b.id}] ${b.text}`).join('\n').slice(0,3800),chat=[...messages.map(m=>({role:m.role,text:(m.content||[]).filter(p=>p.type==='text').map(p=>p.text).join('\n')})),...oldChat].slice(-8).map(m=>`${m.role}: ${m.text}`).join('\n').slice(0,2500);
  if(!evidence&&!chat&&!summary)continue;
  const path=`${paperCore.ROOT}/${paper.id}/paper.json`,file=vault.getAbstractFileByPath(path);if(!file)continue;
  const text=[`论文：${paper.title}`,selection?`使用者选择第 ${selection.page} 页：${selection.text}`:'',`原文选摘（不代表全文）：\n${evidence}`,`AI 摘要（需要核对）：\n${summary?.overview||''}`,`阅读对话（不是新的原始证据）：\n${chat}`,`个人阅读想法（可能是草稿）：\n${String(paper.noteDraft||'').slice(0,2000)}`].join('\n\n');
  add({kind:'paper',path,title:summary?.titleZh||paper.title,hash:c.hash(await vault.read(file)),link:paper.pdfPath+(excerpts[0]?'#page='+excerpts[0].page:''),basis:'已发生阅读活动；原文选摘、摘要与对话应分开判断，未独立验证'},text);
 }
 if(!paperId){const files=vault.getMarkdownFiles().filter(f=>allowed(f.path)&&within(c.local(new Date(f.stat.mtime)).day,p)).sort((a,b)=>b.stat.mtime-a.stat.mtime);for(const file of files){if(all.length>=maxSources){total++;continue;}const text=await vault.read(file);add({kind:file.path.startsWith('wiki/')?'wiki':'record',path:file.path,title:file.basename,hash:c.hash(text),basis:text.includes('<!-- zhixing-knowledge')?'含 AI 自动总结（未人工核验）；不构成新的独立证据':'笔记中的陈述；需区分记录、推断与已验证结论'},text);}}
 const targetNotes=targets.slice(0,200).map(path=>({path,title:path.split('/').pop().slice(0,-3)}));
 return{sources:all,targets,targetNotes,totalEligible:total,truncated:total>all.length||all.some(s=>s.truncated)};
}
module.exports={collect,allowed,within};
