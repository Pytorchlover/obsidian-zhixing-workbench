'use strict';
const {setIcon,Notice}=require('obsidian');
const {baseId}=require('./arxiv');
const el=(p,tag,cls,text)=>p.createEl(tag,{cls,text});
const button=(p,text,cls,fn)=>{const b=el(p,'button','zd-btn '+(cls||''),text);b.type='button';b.onclick=fn;return b;};
module.exports=function mountArxiv(host,{svc,plugin,state,categories}){
 let disposed=false,loading=false,importing=null,requestSerial=0,local=new Map();
 const intro=el(host,'section','zd-arxiv-intro');el(intro,'p','zd-arxiv-eyebrow','ARXIV · DISCOVER');el(intro,'h2','','从一个问题，找到下一篇论文。');el(intro,'p','zd-muted','搜索英文关键词、论文标题、作者或编号，读过的线索留在自己的论文库。');
 const form=el(host,'form','zd-arxiv-form'),search=el(form,'div','zd-arxiv-search');const icon=el(search,'span','zd-icon');setIcon(icon,'search');
 const input=el(search,'input');input.type='search';input.maxLength=300;input.value=state.query||'';input.placeholder='Diffusion Policy、vision language action、2303.04137…';input.setAttribute('aria-label','搜索 arXiv 论文');
 const submit=el(search,'button','zd-btn zd-primary','搜索 arXiv');submit.type='submit';
 const options=el(form,'div','zd-arxiv-options');
 function select(parent,label,items,value,aria){const wrap=el(parent,'label','zd-arxiv-option');el(wrap,'span','',label);const s=el(wrap,'select','zd-sort');s.setAttribute('aria-label',aria||label);for(const [id,name]of items){const o=el(s,'option','',name);o.value=id;}s.value=value;return s;}
 const field=select(options,'搜索范围',[['all','全部字段'],['ti','标题'],['au','作者']],state.field||'all');
 const sort=select(options,'排序',[['relevance','相关度'],['submittedDate','最新发表'],['lastUpdatedDate','最近更新']],state.sort||'relevance');
 const archive=select(options,'入库分类',[['','未分类'],...categories.map(c=>[c,c])],state.category||'');archive.onchange=()=>state.category=archive.value;
 const tips=el(host,'div','zd-arxiv-topics');el(tips,'span','zd-muted','试试');for(const term of ['vision language action','Diffusion Policy','world model','robot teleoperation'])button(tips,term,'zd-link',()=>{if(loading)return;input.value=term;field.value='all';searchFor(0);});
 const status=el(host,'p','zd-arxiv-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const results=el(host,'section','zd-arxiv-results');results.setAttribute('aria-label','arXiv 搜索结果');
 const pagination=el(host,'nav','zd-arxiv-pagination');pagination.setAttribute('aria-label','arXiv 搜索结果翻页');
 const importButtons=new Map();
 function syncButtons(){for(const [id,{b,item,statusNode}]of importButtons){const record=local.get(baseId(id));b.disabled=!!importing;b.textContent=record?'打开阅读':importing===id?'正在入库…':'加入论文库';b.classList.toggle('zd-primary',!record);b.classList.toggle('zd-link',!!record);if(record&&!statusNode.textContent)statusNode.textContent='已在本地论文库';}}
 async function add(item,b,stateNode){
  if(importing||disposed)return;
  const existing=local.get(baseId(item.id));if(existing){await plugin.openPapers(existing.id);return;}
  const category=archive.value;importing=item.id;syncButtons();stateNode.setAttribute('role','status');stateNode.textContent='准备下载…';
  try{
   let paper=await svc.importArxiv(item.id,text=>{if(stateNode.isConnected&&!disposed)stateNode.textContent=text;},item);
   if(category&&!paper.category)paper=await svc.update(paper.id,p=>{if(!p.category)p.category=category;});
   local.set(baseId(item.id),paper);if(!disposed){stateNode.textContent='已归档 · PDF 保存在本地';syncButtons();}new Notice('已加入本地论文库：'+paper.title);
  }catch(e){if(!disposed){stateNode.textContent=e.message||'下载失败，请重试。';stateNode.setAttribute('role','alert');}else new Notice(e.message||'论文入库未完成');}
  finally{importing=null;if(!disposed)syncButtons();}
 }
 function draw(){
  if(disposed)return;results.empty();pagination.empty();importButtons.clear();
  const response=state.result;
  if(!response){const empty=el(results,'div','zd-arxiv-empty');const i=el(empty,'span','zd-icon');setIcon(i,'library');el(empty,'h3','','发现 → 归档 → 阅读');el(empty,'p','','先搜索，再把值得细读的论文加入本地。原文、摘要、译文和对话会归在同一处。');return;}
  const heading=el(results,'div','zd-arxiv-result-heading');el(heading,'h3','',`“${response.query}”`);el(heading,'span','zd-muted',response.total?`共 ${response.total.toLocaleString()} 篇 · ${response.start+1}–${response.start+response.items.length}`:'暂无匹配结果');
  if(!response.items.length){const empty=el(results,'div','zd-arxiv-empty');el(empty,'h3','','换一个关键词试试');el(empty,'p','','可用英文关键词、精确标题，或直接粘贴 arXiv 编号和链接。');return;}
  for(const item of response.items){
   const row=el(results,'article','zd-arxiv-result');row.dataset.arxivId=item.id;
   const meta=el(row,'div','zd-arxiv-meta');el(meta,'span','zd-arxiv-id',item.id);if(item.categories[0])el(meta,'span','',item.categories[0]);if(item.published)el(meta,'time','',item.published);
   const title=el(row,'h3','zd-arxiv-title');const link=el(title,'a','',item.title);link.href=item.source;link.target='_blank';link.rel='noreferrer';link.setAttribute('aria-label',item.title+'（arXiv 原文页面）');
   const authors=el(row,'p','zd-arxiv-authors',item.authors);authors.title=item.authors;
   const abstract=el(row,'p','zd-arxiv-abstract',item.abstract||'arXiv 未提供摘要。');
   const actions=el(row,'div','zd-arxiv-actions');const more=button(actions,'展开摘要','zd-link',()=>{const expanded=abstract.classList.toggle('is-expanded');more.textContent=expanded?'收起摘要':'展开摘要';more.setAttribute('aria-expanded',String(expanded));});more.setAttribute('aria-expanded','false');
   const stateNode=el(actions,'span','zd-arxiv-import-status');stateNode.setAttribute('role','status');stateNode.setAttribute('aria-live','polite');
   const b=button(actions,'加入论文库','zd-primary',()=>add(item,b,stateNode).catch(e=>new Notice(e.message)));b.setAttribute('aria-label','加入或打开论文：'+item.title);importButtons.set(item.id,{b,item,statusNode:stateNode});
  }
  syncButtons();
  const prev=button(pagination,'← 上一页','zd-link',()=>pageTo(response,Math.max(0,response.start-10)));prev.disabled=loading||response.start===0;
  el(pagination,'span','zd-muted',`第 ${Math.floor(response.start/10)+1} 页`);
  const next=button(pagination,'下一页 →','zd-link',()=>pageTo(response,response.start+10));next.disabled=loading||response.items.length<10||response.start+response.items.length>=response.total||response.start>=10000;
 }
 function pageTo(response,start){input.value=response.query;field.value=response.field;sort.value=response.sort;searchFor(start);}
 async function searchFor(start){
  if(loading||disposed)return;const query=input.value.trim();if(!query){input.focus();status.textContent='请输入关键词、标题、作者或 arXiv 编号。';return;}
  const current=++requestSerial;loading=true;state.query=query;state.field=field.value;state.sort=sort.value;status.setAttribute('role','status');status.textContent='正在搜索 arXiv…';results.setAttribute('aria-busy','true');submit.disabled=true;field.disabled=true;sort.disabled=true;
  for(const b of pagination.querySelectorAll('button'))b.disabled=true;
  try{
   const response=await svc.searchArxiv({query,field:state.field,sort:state.sort,start,size:10});
   const records=await svc.list();if(disposed||current!==requestSerial)return;
   local=new Map(records.map(p=>[baseId(p.arxivId||p.source),p]).filter(([id])=>id));
   state.result={...response,query,start,field:state.field,sort:state.sort};status.textContent='';draw();
  }catch(e){if(!disposed&&current===requestSerial){status.setAttribute('role','alert');status.textContent=(e.message||'搜索失败，请稍后重试。')+(state.result?' 仍显示上次的搜索结果。':'');}}
  finally{if(!disposed&&current===requestSerial){loading=false;submit.disabled=false;field.disabled=false;sort.disabled=false;results.removeAttribute('aria-busy');const page=state.result;if(page){const buttons=pagination.querySelectorAll('button');if(buttons[0])buttons[0].disabled=page.start===0;if(buttons[1])buttons[1].disabled=page.items.length<10||page.start+page.items.length>=page.total||page.start>=10000;}}}
 }
 form.onsubmit=e=>{e.preventDefault();searchFor(0);};
 draw();svc.list().then(records=>{if(disposed)return;local=new Map(records.map(p=>[baseId(p.arxivId||p.source),p]).filter(([id])=>id));syncButtons();}).catch(()=>{});
 return {dispose:()=>{disposed=true;requestSerial++;}};
};
