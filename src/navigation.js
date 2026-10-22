'use strict';
const {ItemView,Notice,setIcon}=require('obsidian');
const TYPE='zhixing-navigation';
const LABELS={'VLA':'VLA 与具身模型','World-Models':'世界模型','Data-Collection':'数据采集','Robotics':'机器人工程','Agents':'Agent 学习','Tools':'工具与方法','reviews':'周期复盘','daily':'整理日志','general':'总览与路线','source':'原始资料'};
const el=(p,t,c,text)=>p.createEl(t,{cls:c,text});
function btn(p,text,cls,fn,ico){const b=el(p,'button','zd-btn '+(cls||''));b.type='button';if(ico){const s=el(b,'span','zd-icon');setIcon(s,ico);}el(b,'span','',text);b.onclick=async event=>{if(b.disabled)return;b.disabled=true;try{await fn(event);}catch(e){new Notice('未完成：'+e.message);}finally{b.disabled=false;}};return b;}
function describe(s){return String(s||'').replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,'$2').replace(/\[\[([^\]]+)\]\]/g,'$1').replace(/[*`]/g,'').trim();}
module.exports=function installNavigation(plugin){
 const app=plugin.app;
 const resolve=path=>app.vault.getAbstractFileByPath(path)||app.metadataCache.getFirstLinkpathDest(path,'知识库首页.md');
 plugin.isDirectory=path=>{const f=resolve(path);return f&&(f.path==='wiki/index.md'||f.basename==='项目总览'||f.path.startsWith('wiki/')&&f.basename.endsWith('MOC'));};
 plugin.openDirectory=async path=>{
  if(plugin.openingDesk)await plugin.openingDesk;
  if(plugin.openingDirectory)await plugin.openingDirectory;
  const operation=(async()=>{let leaf=app.workspace.getLeavesOfType(TYPE)[0];if(!leaf){leaf=app.workspace.getLeaf('tab');await leaf.setViewState({type:TYPE});}await app.workspace.revealLeaf(leaf);if(leaf.isDeferred)await leaf.loadIfDeferred();await leaf.view.setState({path:resolve(path)?.path||'wiki/index.md'});await app.workspace.revealLeaf(leaf);app.workspace.setActiveLeaf(leaf,{focus:true});return leaf;})();
  plugin.openingDirectory=operation;try{return await operation;}finally{if(plugin.openingDirectory===operation)plugin.openingDirectory=null;}
 };
 class DirectoryView extends ItemView{
  constructor(leaf){super(leaf);this.path='wiki/index.md';this.query='';this.category='all';this.serial=0;}
  getViewType(){return TYPE;}
  getDisplayText(){return this.path.includes('项目总览')?'项目空间':this.path==='wiki/index.md'?'知识索引':resolve(this.path)?.basename.replace(' MOC','')||'知识索引';}
  getIcon(){return this.path.includes('项目总览')?'folder-open':'library';}
  getState(){return{path:this.path};}
  async setState(state){this.path=state.path||'wiki/index.md';this.query='';this.category='all';await this.render();}
  async onOpen(){this.contentEl.addClass('zd-view');await this.render();}
  async onClose(){this.serial++;this.contentEl.removeClass('zd-view');}
  async render(){
   const request=++this.serial,source=resolve(this.path);if(!source)return;
   let summaries=new Map();const index=resolve('wiki/index.md');
   if(index){const content=await app.vault.cachedRead(index);for(const line of content.split('\n')){const m=line.match(/^- \[\[(.*?)\]\]\s*[—–-]\s*(.*)/);if(m){const f=resolve(m[1].split('|')[0]);if(f)summaries.set(f.path,describe(m[2]));}}}
   if(request!==this.serial)return;
   const projects=source.basename==='项目总览',topic=!projects&&source.path!=='wiki/index.md';
   let files=projects?plugin.projectFiles().map(p=>({...p,file:resolve(p.path),category:'project'})):app.vault.getMarkdownFiles().filter(f=>f.path.startsWith('wiki/')&&!['index','log'].includes(f.basename)&&!f.basename.endsWith('MOC')).map(f=>({file:f,path:f.path,title:f.basename,subtitle:summaries.get(f.path)||'',category:f.path.split('/').length>2?f.path.split('/')[1]:'general'}));
   let missing=[];
   if(topic){const links=app.metadataCache.getFileCache(source)?.links||[];const wanted=new Set();for(const link of links){const f=app.metadataCache.getFirstLinkpathDest(link.link.split('#')[0],source.path);if(f)wanted.add(f.path);else missing.push(link.displayText||link.link);}files=files.filter(f=>wanted.has(f.path));for(const path of wanted){const f=resolve(path);if(f&&f.extension==='md'&&path!==source.path&&!files.some(x=>x.path===path))files.push({file:f,path,title:f.basename,subtitle:summaries.get(path)||(path.startsWith('raw/')?'原始资料 · '+f.parent.path:''),category:path.startsWith('wiki/')?(path.split('/').length>2?path.split('/')[1]:'general'):'source'});}}
   this.items=files;this.contentEl.empty();this.root=el(this.contentEl,'div','zd zd-library');
   const side=el(this.root,'aside','zd-side');const brand=el(side,'div','zd-brand');const sprout=el(brand,'span','zd-icon');setIcon(sprout,'sprout');el(brand,'span','','知行之间');
   const nav=el(side,'nav','zd-nav');nav.setAttribute('aria-label','个人空间导航');
   btn(nav,'工作台','',()=>plugin.openDesk(),'house');btn(nav,'每日记录','',()=>plugin.openDaily(),'calendar-days');btn(nav,'论文','',()=>plugin.openPapers(),'graduation-cap');btn(nav,'项目空间',projects?'zd-nav-active':'',()=>plugin.openDirectory('项目总览'),'folder-open');btn(nav,'知识索引',!projects?'zd-nav-active':'',()=>plugin.openDirectory('wiki/index.md'),'book-open');
   el(side,'p','zd-side-label','研究领域');for(const [title,path] of [['VLA 与具身模型','VLA MOC'],['世界模型','世界模型 MOC'],['数据采集','数据采集 MOC'],['机器人工程','机器人工程 MOC'],['Agent 与工具','Agent 学习 MOC']])btn(side,title,'zd-topic'+(source.basename===path?' is-active':''),()=>plugin.openDirectory(path),'circle-small');
   const main=el(this.root,'main','zd-main');const top=el(main,'div','zd-top');const crumb=el(top,'nav','zd-crumb');btn(crumb,'工作台','zd-link',()=>plugin.openDesk(),'house');el(crumb,'span','','/');if(topic){btn(crumb,'知识索引','zd-link',()=>plugin.openDirectory('wiki/index.md'));el(crumb,'span','','/');}el(crumb,'span','',projects?'项目空间':topic?source.basename.replace(' MOC',''):'知识索引');btn(top,'查看原笔记','zd-search',()=>plugin.openNote(source.path,undefined,true),'file-text');
   const header=el(main,'header','zd-heading');const intro=el(header,'div');el(intro,'h1','',projects?'项目空间':topic?source.basename.replace(' MOC',''):'知识索引');el(intro,'p','zd-date',projects?'目标、进展与资料，从这里继续。':topic?'主题笔记集中浏览；完整脉络保留在原笔记中。':'按研究领域浏览，或直接搜索笔记名称与摘要。');
   const tools=el(main,'div','zd-directory-tools');const label=el(tools,'label','zd-library-search');const ico=el(label,'span','zd-icon');setIcon(ico,'search');const search=el(label,'input');search.type='search';search.placeholder=projects?'搜索项目…':'搜索笔记或关键词…';search.setAttribute('aria-label',projects?'搜索项目':'搜索知识笔记');search.value=this.query;
   const sort=el(tools,'select','zd-sort');sort.setAttribute('aria-label','排序方式');for(const [value,text]of [['recent','最近更新'],['title','名称排序']]){const o=el(sort,'option','',text);o.value=value;}sort.value=this.sort||'recent';sort.onchange=()=>{this.sort=sort.value;draw();};
   const filters=el(main,'div','zd-filters');filters.setAttribute('aria-label','知识分类');const choices=new Map(projects?[]:[['all','全部']]);if(!projects)for(const id of Object.keys(LABELS))if(files.some(f=>f.category===id))choices.set(id,LABELS[id]);
   const buttons=[];for(const [id,name]of choices){const count=id==='all'?files.length:files.filter(f=>f.category===id).length;const b=btn(filters,`${name} · ${count}`,'',()=>{this.category=id;draw();});buttons.push([id,b]);}
   const count=el(main,'p','zd-directory-count');count.setAttribute('role','status');const list=el(main,'div',projects?'zd-project-grid':'zd-library-list');
   const draw=()=>{const q=this.query.trim().toLocaleLowerCase(),matches=files.filter(f=>(this.category==='all'||f.category===this.category)&&(!q||(f.title+' '+f.subtitle+' '+(LABELS[f.category]||'')).toLocaleLowerCase().includes(q))).sort((a,b)=>this.sort==='title'?a.title.localeCompare(b.title,'zh-CN'):(b.file?.stat.mtime||0)-(a.file?.stat.mtime||0)||a.title.localeCompare(b.title,'zh-CN'));for(const [id,b]of buttons){b.classList.toggle('is-active',id===this.category);b.setAttribute('aria-pressed',String(id===this.category));}count.textContent=`${matches.length} ${projects?'个项目':'篇笔记'}`;list.empty();
    if(!matches.length){const empty=el(list,'div','zd-empty');el(empty,'strong','','没有找到匹配的内容');el(empty,'p','','换个关键词，或清除筛选再找找。');btn(empty,'清除筛选','zd-secondary',()=>{this.query='';this.category='all';search.value='';draw();});}
    for(const item of matches){const b=btn(list,'',projects?'zd-project-card':'zd-library-row',()=>plugin.openNote(item.path));b.dataset.path=item.path;const copy=el(b,'span','zd-library-copy');if(!projects)el(copy,'span','zd-card-kicker',LABELS[item.category]||'知识笔记');el(copy,'strong','',item.title);if(item.subtitle)el(copy,'span','zd-card-description',item.subtitle);const meta=el(b,'span','zd-card-meta');el(meta,'span','',projects?`${app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(item.path.slice(0,item.path.lastIndexOf('/')+1))).length} 篇项目文档`:'更新于 '+new Date(item.file.stat.mtime).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'}));const arrow=el(meta,'span','zd-icon');setIcon(arrow,'arrow-up-right');}
   };
   search.oninput=()=>{this.query=search.value;draw();};draw();
   if(missing.length){const details=el(main,'details','zd-missing');el(details,'summary','',`原笔记中还有 ${missing.length} 个待补充链接`);el(details,'p','',missing.join('、'));btn(details,'查看原笔记','zd-link',()=>plugin.openNote(source.path,undefined,true));}
   this.contentEl.scrollTop=0;this.leaf.updateHeader();
  }
 }
 plugin.registerView(TYPE,leaf=>new DirectoryView(leaf));
 plugin.addCommand({id:'open-library',name:'打开知识索引',callback:()=>plugin.openDirectory('wiki/index.md')});
 plugin.addCommand({id:'open-projects',name:'打开项目空间',callback:()=>plugin.openDirectory('项目总览')});
 // Apply a reading skin and persistent navigation to real Markdown leaves, without rewriting notes.
 const decorate=()=>{
  for(const leaf of app.workspace.getLeavesOfType('markdown')){const view=leaf.view,file=view.file;if(!view.contentEl)continue;
   const eligible=file&&(file.path.startsWith('wiki/')||file.path.startsWith('projects/')&&!file.path.includes('/plugin/')&&!file.path.includes('/设计预览/'));
   view.containerEl.classList.toggle('zd-reading',!!eligible);view.contentEl.classList.toggle('zd-reading-content',!!eligible);
   let bar=view.contentEl.querySelector(':scope > .zd-reading-bar');
   if(!eligible){bar?.remove();view.contentEl.querySelector(':scope > .zd-reading-sidebar')?.remove();continue;}if(bar?.dataset.path===file.path)continue;bar?.remove();view.contentEl.querySelector(':scope > .zd-reading-sidebar')?.remove();
   const daily=file.path.startsWith('projects/个人工作台/日记/'),projectSection=file.path.startsWith('projects/')&&!daily;
   const side=document.createElement('aside');side.className='zd zd-side zd-reading-sidebar';view.contentEl.prepend(side);const brand=el(side,'div','zd-brand');const sprout=el(brand,'span','zd-icon');setIcon(sprout,'sprout');el(brand,'span','','知行之间');const nav=el(side,'nav','zd-nav');nav.setAttribute('aria-label','个人空间导航');btn(nav,'工作台','',()=>plugin.openDesk(),'house');btn(nav,'每日记录',daily?'zd-nav-active':'',()=>plugin.openDaily(),'calendar-days');btn(nav,'论文','',()=>plugin.openPapers(),'graduation-cap');btn(nav,'项目空间',projectSection?'zd-nav-active':'',()=>plugin.openDirectory('项目总览'),'folder-open');btn(nav,'知识索引',!daily&&!projectSection?'zd-nav-active':'',()=>plugin.openDirectory('wiki/index.md'),'book-open');el(side,'p','zd-side-label','研究领域');for(const [title,path]of [['VLA 与具身模型','VLA MOC'],['世界模型','世界模型 MOC'],['数据采集','数据采集 MOC'],['机器人工程','机器人工程 MOC'],['Agent 与工具','Agent 学习 MOC']])btn(side,title,'zd-topic',()=>plugin.openDirectory(path),'circle-small');
   bar=document.createElement('div');bar.className='zd zd-reading-bar';bar.dataset.path=file.path;view.contentEl.prepend(bar);
   const links=el(bar,'nav','zd-reading-links');links.setAttribute('aria-label','笔记导航');btn(links,'工作台','zd-link',()=>plugin.openDesk(),'arrow-left');
   const project=file.path.startsWith('projects/')&&!file.path.includes('/日记/');btn(links,daily?'每日记录':project?'项目空间':'知识索引','zd-link',()=>daily?plugin.openDaily():plugin.openDirectory(project?'项目总览':'wiki/index.md'),daily?'calendar-days':project?'folder-open':'book-open');
   const title=plugin.projectFiles().find(p=>p.path===file.path)?.title||file.basename;el(links,'span','zd-reading-title',title);
   const actions=el(bar,'div','zd-reading-actions');
   if(file.path.startsWith('projects/个人工作台/日记/')){for(const [n,ico]of [[-1,'chevron-left'],[1,'chevron-right']]){const b=btn(actions,'','zd-link',async()=>{const d=require('obsidian').moment(file.basename,'YYYY-MM-DD',true).add(n,'day').format('YYYY-MM-DD');await plugin.openNote((await plugin.ensureDaily(d)).path);},ico);b.setAttribute('aria-label',n<0?'前一天':'后一天');}}
   const headings=app.metadataCache.getFileCache(file)?.headings?.filter(h=>h.level===2)||[];
   if(headings.length){const select=el(actions,'select','zd-reading-sections');select.setAttribute('aria-label','跳转到章节');el(select,'option','','跳转章节');for(const h of headings){const o=el(select,'option','',h.heading);o.value=h.heading;}select.onchange=()=>{if(select.value!=='跳转章节')(plugin.sectionNavigation=app.workspace.openLinkText(file.path+'#'+select.value,file.path,false));};}
   btn(actions,'编辑 / 阅读','zd-link',async()=>{app.workspace.setActiveLeaf(leaf,{focus:true});await leaf.setViewState({type:'markdown',state:{...view.getState(),mode:view.getMode()==='preview'?'source':'preview'}});},'pencil-line');
  }
 };
 const routeLink=event=>{if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const a=event.target.closest?.('a.internal-link');if(!a)return;const href=a.dataset.href||a.getAttribute('href');if(!href||href.includes('#'))return;const source=app.workspace.getActiveFile()?.path||'知识库首页.md',f=app.metadataCache.getFirstLinkpathDest(href,source);if(!f)return;if(plugin.isDirectory(f.path)||f.path==='知识库首页.md'){event.preventDefault();event.stopImmediatePropagation();(f.path==='知识库首页.md'?plugin.openDesk():plugin.openDirectory(f.path)).catch(e=>new Notice(e.message));}};
 document.addEventListener('click',routeLink,true);plugin.register(()=>document.removeEventListener('click',routeLink,true));
 plugin.decorateNotes=decorate;
 plugin.registerEvent(app.workspace.on('active-leaf-change',decorate));plugin.registerEvent(app.workspace.on('file-open',decorate));plugin.registerEvent(app.metadataCache.on('changed',file=>{for(const leaf of app.workspace.getLeavesOfType('markdown'))if(leaf.view.file?.path===file.path)leaf.view.contentEl.querySelector(':scope > .zd-reading-bar')?.remove();decorate();}));
 plugin.register(()=>{for(const leaf of app.workspace.getLeavesOfType('markdown')){leaf.view.containerEl.removeClass('zd-reading');leaf.view.contentEl.removeClass('zd-reading-content');leaf.view.contentEl.querySelector(':scope > .zd-reading-bar')?.remove();leaf.view.contentEl.querySelector(':scope > .zd-reading-sidebar')?.remove();}});
 app.workspace.onLayoutReady(decorate);
};
