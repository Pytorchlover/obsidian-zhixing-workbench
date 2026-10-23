'use strict';
const {Notice,Modal}=require('obsidian');
const {baseId}=require('./arxiv');
const {classify}=require('./paper-categories');
const el=(p,t,cls,text)=>p.createEl(t,{cls,text});
function button(p,text,fn,cls='zd-secondary'){const b=el(p,'button','zd-btn '+cls,text);b.type='button';b.onclick=async()=>{if(b.disabled)return;try{await fn(b);}catch(e){new Notice(e.message);}};return b;}
module.exports=function mountRecommendations(host,{plugin,svc}){
 const service=plugin.recommendations;let disposed=false,serial=0,report=null;
 const head=el(host,'div','zd-recommend-heading');const intro=el(head,'div');el(intro,'h2','','今天，值得读什么');el(intro,'p','zd-muted','跟随你的研究方向，从新论文中挑选值得进一步核对的工作。');
 const refresh=button(head,'更新推荐',async()=>{try{await service.refresh();}catch{}},'zd-primary');
 const status=el(host,'p','zd-recommend-status');status.setAttribute('role','status');
 const settings=el(host,'details','zd-recommend-settings');el(settings,'summary','','订阅方向与推荐设置');
 const form=el(settings,'form','zd-recommend-form');const cfg=service.config();
 const label=(text,tag='input')=>{const l=el(form,'label','zd-recommend-field',text),input=el(l,tag);input.setAttribute('aria-label',text);return input;};
 const keywords=label('检索关键词（每行一个主题；空格连接的词需同时出现）','textarea');keywords.rows=6;keywords.value=cfg.keywords.join('\n');
 const categories=label('arXiv 分类（逗号分隔；留空检索全部领域）');categories.value=cfg.categories.join(', ');
 const nums={};for(const [key,text,min,max] of [['hour','每天更新时间（本机整点）',0,23],['days','检索最近多少天',1,90],['limit','每日最多解读篇数',1,12],['minScore','优先推荐分数线',0,100]]){const i=label(text);i.type='number';i.min=min;i.max=max;i.value=cfg[key];nums[key]=i;}
 const enabled=label('每日自动更新');enabled.type='checkbox';enabled.checked=cfg.enabled;
 const ai=label('使用已配置的 MiniMax 解读与评分');ai.type='checkbox';ai.checked=cfg.ai;
 el(form,'p','zd-muted','Obsidian 开着时每日到点检索；错过后在下次打开时补查。每篇新候选最多调用模型 3 次，同摘要与关键词复用缓存。关键词适合使用英文。');
 const save=el(form,'button','zd-btn zd-primary','保存设置');save.type='submit';const saved=el(form,'p','zd-muted');saved.setAttribute('role','status');
 form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{const value={...cfg,keywords:keywords.value.split('\n').map(x=>x.trim()).filter(Boolean),categories:categories.value.split(/[,，]/).map(x=>x.trim()).filter(Boolean),enabled:enabled.checked,ai:ai.checked};for(const [key,input]of Object.entries(nums))value[key]=Number(input.value);await service.configure(value);saved.textContent='设置已保存；下次更新按新方向检索，也可以立即点击“更新推荐”。';}catch(e){saved.textContent=e.message;}finally{save.disabled=false;}};
 const info=el(host,'details','zd-recommend-method');el(info,'summary','','评分如何计算');el(info,'p','','复用 WujieHOT 的五维评分：实质份量、信息增量、证据强度、共振面、可用性；论文权重为 5 / 3 / 1 / 0 / 1。两次独立调用取平均并向下取整。分数表示关注价值，不是论文真实性或学术质量认证；当前分数线未经个人标注样本校准，可在设置中调整。');el(info,'p','','证据检查仅针对 arXiv 摘要：提及实验或开源不代表已经核实全文、代码、结果或同行评审。材料不足会显示“待核对”。');const upstream=el(info,'a','','查看 WujieHOT 评分标准');upstream.href='https://github.com/Pytorchlover/WujieHOT/blob/main/industry/prompts/selection-score.md';upstream.target='_blank';upstream.rel='noopener noreferrer';
 const list=el(host,'div','zd-recommend-list');
 function illustration(card,paper){
  if(!plugin.recommendationImages)return;
  const figure=el(card,'figure','zd-recommend-figure'),preview=el(figure,'div','zd-recommend-figure-preview'),caption=el(figure,'figcaption','zd-recommend-figure-caption');
  el(preview,'span','zd-muted','正在获取论文原图…');caption.textContent='优先选择方法总览或架构图';
  const alive=()=>!disposed&&figure.isConnected;
  const show=async(force=false)=>{try{const record=await plugin.recommendationImages.get(paper,{force});if(!alive())return;preview.empty();caption.empty();figure.querySelectorAll('.zd-recommend-figure-detail').forEach(e=>e.remove());
   if(record.kind!=='image'){figure.classList.add('is-unavailable');el(preview,'span','zd-muted',record.message||'暂未找到合适的原图');button(preview,'重试获取',async b=>{b.disabled=true;figure.classList.remove('is-unavailable');preview.empty();el(preview,'span','zd-muted','正在获取论文原图…');await show(true);},'zd-link');return;}
   figure.classList.remove('is-unavailable');const f=record.figure,url=plugin.recommendationImages.resource(f),open=button(preview,'',()=>{const modal=new Modal(plugin.app);modal.modalEl.addClass('zd-recommend-figure-modal');modal.titleEl.textContent=paper.assessment?.titleZh||paper.title;const image=el(modal.contentEl,'img');image.src=url;image.alt=f.caption;el(modal.contentEl,'p','zd-muted',f.caption);const source=el(modal.contentEl,'a','','查看论文原图'+(f.page?' · 第 '+f.page+' 页':''));source.href=f.source;source.target='_blank';source.rel='noopener noreferrer';modal.open();},'zd-recommend-figure-button');open.setAttribute('aria-label','放大论文配图：'+f.label);const image=el(open,'img');image.src=url;image.alt=f.caption;image.width=f.width;image.height=f.height;image.decoding='async';
   image.onerror=()=>{if(!alive())return;preview.empty();el(preview,'span','zd-muted','本地配图无法显示');button(preview,'重新获取',()=>show(true),'zd-link');};
   const source=el(caption,'a','',f.label+(f.page?' · 原文第 '+f.page+' 页':' · 论文原图'));source.href=f.source;source.target='_blank';source.rel='noopener noreferrer';el(caption,'span','','点击图片放大');const detail=el(figure,'details','zd-recommend-figure-detail');el(detail,'summary','','原图说明');el(detail,'p','',f.caption);
  }catch(e){if(alive()){preview.empty();el(preview,'span','zd-muted','配图暂不可用');button(preview,'重试获取',()=>show(true),'zd-link');caption.textContent='论文原文仍可正常查看';}}};
  void show();
 }

 async function draw(){const request=++serial;const state=service.state();refresh.disabled=state.busy;refresh.textContent=state.busy?'正在更新…':'更新推荐';status.textContent=state.progress||state.error||'';if(state.busy&&report)return;
  const next=await service.latest();if(disposed||request!==serial)return;report=next;list.empty();const local=new Map((await svc.list()).map(x=>[baseId(x.arxivId||x.source),x.id]));if(disposed||request!==serial)return;
  if(!report){el(list,'div','zd-empty','还没有推荐。点击“更新推荐”，或等待每日自动检索。');return;}
  el(list,'p','zd-muted',`${report.day} · 最近 ${report.config.days} 天 · ${report.items.length} 篇候选${report.complete?'':' · 本次尚未完成'}${report.searchErrors.length?' · 部分检索失败':''}`);
  if(!report.items.length)el(list,'p','zd-empty','本次没有尚未推荐或归档的新论文。可以扩大检索天数，或减少同一行关键词。');
  for(const paper of report.items){const a=paper.assessment,recommendationDay=report.day,card=el(list,'article','zd-recommend-card');const top=el(card,'div','zd-recommend-card-top');el(top,'span','zd-recommend-topic',paper.matched.join(' / '));el(top,'span','zd-recommend-score',a?`${a.score} 关注分 · ${a.score>=service.config().minScore?'优先阅读':'扩展候选'}`:'尚未评分');
   const h=el(card,'h3');const link=el(h,'a','',a?.titleZh||paper.title);link.href=paper.source;link.target='_blank';link.rel='noopener noreferrer';if(a)el(card,'p','zd-recommend-original',paper.title);
   el(card,'p','zd-muted',`${paper.published} · ${paper.id} · ${paper.categories.join(' / ')}`);illustration(card,paper);el(card,'p','zd-recommend-brief',a?.brief||paper.abstract);
   const reason=el(card,'div','zd-recommend-reason');el(reason,'strong','','为什么推荐');const reasonText=el(reason,'p','',a?.reason||'检索命中：'+paper.matched.join('、')+'。尚未完成 AI 解读，请先查看摘要。');if(reasonText.textContent.length>150){const expand=button(reason,'展开理由',b=>{const open=reason.classList.toggle('is-expanded');b.textContent=open?'收起理由':'展开理由';b.setAttribute('aria-expanded',String(open));},'zd-link');expand.setAttribute('aria-expanded','false');}
   if(a){const details=el(card,'details','zd-recommend-evidence');el(details,'summary','','摘要证据检查 · 评分 '+a.scores.join(' / '));for(const e of a.evidence){const row=el(details,'p');el(row,'strong','',({method:'方法',experiments:'实验',reproducibility:'复现线索'})[e.key]+' · '+(e.status==='mentioned'?'摘要有提及':'待核对'));el(row,'span','',' — '+e.note);}el(details,'p','',a.limitations);}
   if(paper.analysisError)el(card,'p','zd-error','AI 解读未完成：'+paper.analysisError+'；下次更新可重试。');
   const actions=el(card,'div','zd-recommend-actions');const id=local.get(baseId(paper.id));button(actions,id?'打开本地论文':'加入论文库',async b=>{if(id)return plugin.openPapers(id);b.disabled=true;try{const record=await svc.importArxiv(paper.id,t=>{if(!disposed)b.textContent=t;},paper);await svc.update(record.id,p=>{if(!p.category)p.category=classify(p.title);p.recommendation={day:recommendationDay,reason:a?.reason||'',score:a?.score??null};});new Notice('已归档到本地论文库');if(!disposed)await draw();}finally{if(!disposed)b.disabled=false;}},'zd-primary');
   const raw=el(card,'details','zd-recommend-evidence');el(raw,'summary','','arXiv 原始摘要');el(raw,'p','',paper.abstract);
  }
 }
 const unsubscribe=service.subscribe(()=>{void draw().catch(e=>{if(!disposed)status.textContent=e.message;});});void draw().catch(e=>status.textContent=e.message);
 return{dispose(){disposed=true;serial++;unsubscribe();}};
};
