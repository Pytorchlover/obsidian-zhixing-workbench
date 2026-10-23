'use strict';
const {Plugin, ItemView, MarkdownRenderChild, Notice, FuzzySuggestModal, PluginSettingTab, Setting, setIcon, moment} = require('obsidian');
const VIEW = 'zhixing-research-desk';
const DAILY = 'projects/个人工作台/日记';
const HOME = '知识库首页.md';
const defaults = () => ({durations:{focus:25,short:5,long:15},openOnStartup:true,timer:{phase:'focus',state:'idle',remainingMs:1500000,totalMs:1500000,endsAt:null,id:null,label:''}});
const today = () => moment().format('YYYY-MM-DD');
const safeText = value => String(value || '').replace(/<!--[^]*?-->/g,'').replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,'$2').replace(/\[\[([^\]]+)\]\]/g,'$1').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/[*`]/g,'');
const el = (parent,tag,cls,text) => parent.createEl(tag,{cls,text});
function icon(parent,name){const s=el(parent,'span','zd-icon');setIcon(s,name);return s;}
function button(parent,text,cls,fn,iconName){const b=el(parent,'button','zd-btn '+(cls||''));b.type='button';if(iconName)icon(b,iconName);if(text)el(b,'span','',text);if(fn)b.addEventListener('click',fn);return b;}
function appendSection(data,heading,line){
  const eol=data.includes('\r\n')?'\r\n':'\n',lines=data.split(/\r?\n/),headings=[];let fence=null;
  for(let i=0;i<lines.length;i++){const match=lines[i].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);if(match){if(!fence)fence={char:match[1][0],length:match[1].length};else if(match[1][0]===fence.char&&match[1].length>=fence.length&&!match[2].trim())fence=null;continue;}if(!fence&&/^#{1,2} /.test(lines[i]))headings.push(i);}
  const start=headings.find(i=>lines[i]==='## '+heading);
  if(start===undefined)return data.replace(/\s*$/,'')+eol+eol+'## '+heading+eol+eol+line.replace(/\r?\n/g,eol)+eol;
  let end=headings.find(i=>i>start)??lines.length;
  while(end>start+1&&!lines[end-1].trim())end--;
  lines.splice(end,0,...line.split(/\r?\n/));return lines.join(eol);
}
function replaceTask(content,task,done){
  const lines=content.split('\n');let at=task.line;
  if(lines[at]!==task.raw){const found=lines.flatMap((s,i)=>s===task.raw?[i]:[]);if(found.length!==1)throw new Error('源任务已变化，请刷新后重试。');at=found[0];}
  if(!/^\s*[-*+] \[[ xX]\]/.test(lines[at]))throw new Error('任务状态已变化，请刷新。');
  lines[at]=lines[at].replace(/^(\s*[-*+] \[)[ xX](\])/,'$1'+(done?'x':' ')+'$2');
  return lines.join('\n');
}
class NotePicker extends FuzzySuggestModal{
  constructor(plugin,items,title){super(plugin.app);this.items=items;this.plugin=plugin;this.setPlaceholder(title);}
  getItems(){return this.items;}
  getItemText(item){return item.title||item.basename;}
  onChooseItem(item){this.plugin.openNote(item.path);}
}
class DeskView extends ItemView{
  constructor(leaf,plugin){super(leaf);this.plugin=plugin;}
  getViewType(){return VIEW;}
  getDisplayText(){return '知行之间 · 工作台';}
  getIcon(){return 'sprout';}
  async onOpen(){this.contentEl.empty();this.contentEl.addClass('zd-view');this.desk=new Desk(this.contentEl,this.plugin);this.desk.mount();}
  async onClose(){this.desk?.destroy();this.contentEl.removeClass('zd-view','zd-host');}
}
class DeskBlock extends MarkdownRenderChild{
  constructor(el,plugin){super(el);this.plugin=plugin;}
  onload(){this.desk=new Desk(this.containerEl,this.plugin);this.desk.mount();}
  onunload(){this.desk?.destroy();}
}
class Desk{
  constructor(host,plugin){this.host=host;this.plugin=plugin;this.tab='today';this.disposed=false;this.requestId=0;}
  mount(){
    this.plugin.desks.add(this);this.host.addClass('zd-host');this.host.empty();this.root=el(this.host,'div','zd');
    const side=el(this.root,'aside','zd-side');const brand=el(side,'div','zd-brand');icon(brand,'sprout');el(brand,'span','','知行之间');
    const nav=el(side,'nav','zd-nav');nav.setAttribute('aria-label','工作台导航');
    this.homeNav=button(nav,'工作台','zd-nav-active',()=>this.selectTab('today'),'house');
    button(nav,'每日记录','',()=>this.act(()=>this.plugin.openDaily()),'calendar-days');
    button(nav,'论文','',()=>this.act(()=>this.plugin.openPapers()),'graduation-cap');
    button(nav,'每日推荐','',()=>this.act(()=>this.plugin.openRecommendations()),'sparkles');
    button(nav,'项目空间','',()=>this.plugin.pickProjects(),'folder-open');
    button(nav,'知识索引','',()=>this.plugin.openNote('wiki/index.md'),'book-open');
    el(side,'p','zd-side-label','研究领域');
    for(const [label,link] of [['VLA 与具身模型','VLA MOC'],['世界模型','世界模型 MOC'],['数据采集','数据采集 MOC'],['机器人工程','机器人工程 MOC'],['Agent 与工具','Agent 学习 MOC']])button(side,label,'zd-topic',()=>this.plugin.openNote(link),'circle-small');
    const sf=el(side,'div','zd-side-foot');el(sf,'span','zd-avatar','我');el(sf,'span','','我的本地知识库');
    const main=el(this.root,'main','zd-main');const top=el(main,'div','zd-top');const crumb=el(top,'div','zd-crumb');icon(crumb,'house');el(crumb,'span','','个人空间 / 工作台');
    button(top,'搜索笔记','zd-search',()=>this.plugin.app.commands.executeCommandById('switcher:open'),'search');
    const heading=el(main,'header','zd-heading');const intro=el(heading,'div');el(intro,'h1','','把今天，留给重要的事。');this.date=el(intro,'p','zd-date');
    button(heading,'记录今天','zd-secondary',()=>this.act(()=>this.plugin.openDaily()),'plus');
    const work=el(main,'div','zd-work');const tasks=el(work,'section','zd-panel zd-tasks');const th=el(tasks,'div','zd-section-head');el(th,'h2','','今日重点');this.summary=el(th,'span','zd-muted');
    const tabs=el(tasks,'div','zd-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','任务筛选');this.tabs={};
    for(const [id,label] of [['today','今天'],['all','待完成'],['done','已完成'],['week','本周']]){const b=button(tabs,label,'',()=>this.selectTab(id));b.setAttribute('role','tab');this.tabs[id]=b;}
    this.taskList=el(tasks,'div','zd-task-list');this.taskList.setAttribute('aria-live','polite');
    const form=el(tasks,'form','zd-add-form');const inputLabel=el(form,'label','zd-input-label','下一件事');this.input=el(form,'input','zd-input');this.input.id='zd-task-'+Math.random().toString(36).slice(2);inputLabel.htmlFor=this.input.id;this.input.type='text';this.input.placeholder='写下要完成的一件事…';this.input.maxLength=500;this.input.setAttribute('aria-label','新任务内容');
    const addrow=el(form,'div','zd-add-options');const dateLabel=el(addrow,'label','','计划日期');this.due=el(dateLabel,'input','zd-due');this.due.type='date';this.due.value=today();this.due.setAttribute('aria-label','任务计划日期');
    this.addButton=button(addrow,'添加待办','zd-primary',null,'plus');this.addButton.type='submit';this.formMessage=el(form,'p','zd-form-message');this.formMessage.setAttribute('role','status');
    form.addEventListener('submit',async event=>{event.preventDefault();if(this.addButton.disabled)return;this.addButton.disabled=true;this.formMessage.textContent='';this.formMessage.removeClass('zd-error');try{await this.plugin.addTask(this.input.value,this.due.value);this.input.value='';this.formMessage.textContent='已保存到今天的记录';this.selectTab(this.due.value&&this.due.value>today()?'all':'today');}catch(e){this.formMessage.textContent=e.message;this.formMessage.addClass('zd-error');}finally{this.addButton.disabled=false;}});
    this.makeTimer(work);
    const lower=el(main,'div','zd-lower');const projects=el(lower,'section','zd-panel zd-projects');const ph=el(projects,'div','zd-section-head');el(ph,'h2','','项目空间');button(ph,'查看全部','zd-link',()=>this.plugin.pickProjects(),'arrow-up-right');this.projects=el(projects,'div','zd-project-list');
    const knowledge=el(lower,'section','zd-knowledge');const kh=el(knowledge,'div','zd-section-head');el(kh,'h2','','回到知识里');el(kh,'span','zd-muted','最近更新');this.notes=el(knowledge,'div','zd-note-list');
    const links=el(knowledge,'div','zd-quick-links');for(const [label,path] of [['全库目录','wiki/index.md'],['学习路线','学习路线'],['使用说明','个人工作台使用指南']])button(links,label,'',()=>this.plugin.openNote(path),'arrow-up-right');
    this.refresh();this.updateTimer();
  }
  async act(fn){try{await fn();}catch(e){new Notice('未完成：'+e.message);}}
  selectTab(tab){this.tab=tab;this.refresh();}
  async refresh(){
    const request=++this.requestId;try{
      const all=await this.plugin.getTasks();if(this.disposed||request!==this.requestId)return;
      this.date.textContent=moment().format('YYYY 年 M 月 D 日 · dddd');
      const day=today(),weekEnd=moment().endOf('isoWeek').format('YYYY-MM-DD');
      const todayTasks=all.filter(t=>!t.done&&((t.due&&t.due<=day)||(!t.due&&t.path===`${DAILY}/${day}.md`)||/(?:^|\s)#(?:today|今日)(?:\s|$)/.test(t.raw)));
      const lists={today:todayTasks,all:all.filter(t=>!t.done),done:all.filter(t=>t.done),week:all.filter(t=>!t.done&&((t.due&&t.due<=weekEnd)||!t.due&&t.path.startsWith(DAILY+'/')&&t.path.slice(-13,-3)>=moment().startOf('isoWeek').format('YYYY-MM-DD')&&t.path.slice(-13,-3)<=weekEnd))};
      this.summary.textContent=`${todayTasks.length} 项今日待办`;
      for(const [id,b] of Object.entries(this.tabs)){b.classList.toggle('is-active',id===this.tab);b.setAttribute('aria-selected',String(id===this.tab));b.querySelector('span').textContent=({today:'今天',all:'待完成',done:'已完成',week:'本周'})[id]+` · ${lists[id].length}`;}
      this.taskList.empty();const visible=lists[this.tab];
      if(!visible.length){const empty=el(this.taskList,'div','zd-empty');icon(empty,'leaf');el(empty,'strong','',this.tab==='today'?'今天还没有安排任务':this.tab==='done'?'完成的事，会出现在这里':'这里暂时没有待办');el(empty,'p','',this.tab==='today'?'写下下一步，或者从「待完成」里挑一件。':'任务保存在项目或知识笔记中，工作台会自动汇总。');}
      visible.slice(0,40).forEach(t=>this.renderTask(t));
      if(visible.length>40)el(this.taskList,'p','zd-muted',`当前显示前 40 项；全部 ${visible.length} 项可到源笔记查看。`);
      this.renderProjects();this.renderNotes();
    }catch(e){if(!this.disposed){this.taskList.empty();el(this.taskList,'p','zd-error','读取任务失败：'+e.message);button(this.taskList,'重新读取','zd-link',()=>this.refresh());}}
  }
  renderTask(task){
    const row=el(this.taskList,'div','zd-task'+(task.done?' is-done':''));const check=el(row,'input','zd-check');check.type='checkbox';check.checked=task.done;check.setAttribute('aria-label',(task.done?'重新打开任务：':'完成任务：')+task.text);
    check.addEventListener('change',async()=>{check.disabled=true;try{await this.plugin.toggleTask(task,check.checked);row.addClass('zd-task-saved');await this.refresh();}catch(e){check.checked=task.done;new Notice(e.message);this.refresh();}finally{check.disabled=false;}});
    const info=el(row,'div','zd-task-info');button(info,task.text,'zd-task-title',()=>this.plugin.openNote(task.path,task.line));
    const meta=el(info,'div','zd-task-meta');el(meta,'span','',task.project);if(task.due)el(meta,'span',task.due<today()&&!task.done?'zd-overdue':'',task.due<today()&&!task.done?'逾期 · '+task.due:task.due===today()?'今天':task.due);
    const focus=button(row,'','zd-task-focus',()=>this.act(()=>this.plugin.setFocus(task.text)),'timer');focus.setAttribute('aria-label','专注此任务：'+task.text);focus.title='设为专注任务';
  }
  renderProjects(){
    this.projects.empty();const all=this.plugin.projectFiles();
    for(const project of all.slice(0,3)){const b=button(this.projects,'','zd-project',()=>this.plugin.openNote(project.path));const code=el(b,'span','zd-project-icon');icon(code,project.path.includes('Ego')?'scan-eye':project.path.includes('OpenPI')?'brain-circuit':'bot');const desc=el(b,'span','zd-project-copy');el(desc,'strong','',project.title);el(desc,'span','',project.subtitle);icon(b,'arrow-right');}
    if(!all.length)el(this.projects,'p','zd-muted','在项目目录创建 _context.md 后，会显示在这里。');
  }
  renderNotes(){
    this.notes.empty();const notes=this.plugin.app.vault.getMarkdownFiles().filter(f=>f.path.startsWith('wiki/')&&!['index','log','个人工作台使用指南'].includes(f.basename)&&!f.basename.endsWith('MOC')&&!/^\d{4}-\d{2}-\d{2}$/.test(f.basename)&&!['daily','moc','index','log'].includes(this.plugin.app.metadataCache.getFileCache(f)?.frontmatter?.type)).sort((a,b)=>b.stat.mtime-a.stat.mtime).slice(0,3);
    for(const f of notes){const b=button(this.notes,'','zd-note',()=>this.plugin.openNote(f.path));el(b,'span','',f.basename);icon(b,'arrow-up-right');}
  }
  makeTimer(work){
    const panel=el(work,'section','zd-focus');const top=el(panel,'div','zd-focus-head');el(top,'h2','','留一段专注');this.timerMode=el(top,'span','zd-mode');
    const phases=el(panel,'div','zd-phases');phases.setAttribute('aria-label','专注模式');this.phaseButtons={};
    for(const [phase,label] of [['focus','专注'],['short','短休'],['long','长休']]){this.phaseButtons[phase]=button(phases,label,'',()=>this.act(()=>this.plugin.changePhase(phase)));}
    this.ring=el(panel,'div','zd-ring');this.ringInner=el(this.ring,'div','zd-ring-inner');this.time=el(this.ringInner,'div','zd-time');this.time.setAttribute('role','timer');this.time.setAttribute('aria-label','剩余时间');this.timerHint=el(this.ringInner,'p','');
    this.target=el(panel,'p','zd-focus-target');this.target.title='点击任务右侧的计时图标，可设为专注内容';
    const actions=el(panel,'div','zd-timer-actions');this.timerButton=button(actions,'开始专注','zd-primary',()=>this.act(()=>this.plugin.timerAction()),'play');
    this.reset=button(actions,'','zd-reset',()=>this.act(()=>this.plugin.resetTimer()),'rotate-ccw');this.reset.setAttribute('aria-label','重置计时器');this.reset.title='重置计时器';
    this.focusFoot=el(panel,'p','zd-focus-foot');this.timerError=el(panel,'div','zd-timer-error');this.timerError.setAttribute('role','status');
  }
  updateTimer(){
    if(this.disposed)return;const t=this.plugin.data.timer;const ms=this.plugin.remaining();const sec=Math.ceil(ms/1000),min=Math.floor(sec/60);this.time.textContent=String(min).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
    this.timerMode.textContent=t.state==='running'?'进行中':t.state==='paused'?'已暂停':'准备就绪';
    this.timerHint.textContent=t.phase==='focus'?'一次只做一件事':'给注意力一点留白';
    this.target.textContent=t.label||'选一件事，或者直接开始';
    this.ring.style.setProperty('--zd-progress',`${Math.max(0,Math.min(100,(1-ms/t.totalMs)*100))}%`);
    const label=t.state==='running'?'暂停':t.state==='paused'?'继续':t.phase==='focus'?'开始专注':'开始休息';
    this.timerButton.querySelector('span:last-child').textContent=label;setIcon(this.timerButton.querySelector('.zd-icon'),t.state==='running'?'pause':'play');
    this.timerButton.disabled=this.plugin.finishing;this.reset.disabled=this.plugin.finishing;
    for(const [phase,b] of Object.entries(this.phaseButtons)){b.classList.toggle('is-active',phase===t.phase);b.disabled=t.state!=='idle'||this.plugin.finishing;}
    this.focusFoot.textContent=`${this.plugin.data.durations.focus} 分钟专注 · ${this.plugin.data.durations.short} 分钟休息`;
    this.timerError.empty();if(this.plugin.timerError){el(this.timerError,'p','zd-error',this.plugin.timerError);button(this.timerError,'重试保存','zd-link',()=>this.act(()=>this.plugin.finishTimer()));}
  }
  destroy(){this.disposed=true;this.plugin.desks.delete(this);}
}
class DeskSettings extends PluginSettingTab{
  constructor(app,plugin){super(app,plugin);this.plugin=plugin;}
  display(){this.containerEl.empty();el(this.containerEl,'h2','','知行之间 · 工作台');
    for(const [phase,label] of [['focus','专注时长'],['short','短休息'],['long','长休息']])new Setting(this.containerEl).setName(label).setDesc('分钟，修改后从下一次计时生效').addText(t=>t.setValue(String(this.plugin.data.durations[phase])).onChange(async value=>{const n=Number(value);if(!Number.isInteger(n)||n<1||n>180)return;try{await this.plugin.transact(data=>{data.durations[phase]=n;if(data.timer.state==='idle'&&data.timer.phase===phase)data.timer.remainingMs=data.timer.totalMs=n*60000;});}catch(e){new Notice('未保存设置：'+e.message);}}));
    new Setting(this.containerEl).setName('启动时打开工作台').addToggle(t=>t.setValue(this.plugin.data.openOnStartup).onChange(async value=>{try{await this.plugin.transact(d=>{d.openOnStartup=value;});}catch(e){new Notice('未保存设置：'+e.message);}}));
  }
}
module.exports=class ResearchDesk extends Plugin{
  async onload(){
    const saved=await this.loadData();this.data=defaults();if(saved){this.data={...this.data,...saved,durations:{...this.data.durations,...saved.durations},timer:{...this.data.timer,...saved.timer}};}
    this.desks=new Set();this.queue=Promise.resolve();this.finishing=false;this.timerError='';this.nextRetry=0;this.dailyPromise=null;
    this.registerView(VIEW,leaf=>new DeskView(leaf,this));
    require('./navigation')(this);
    this.appendDailySection=appendSection;
    require('./daily')(this);
    require('./papers')(this);
    this.registerMarkdownCodeBlockProcessor('zhixing-desk',(_source,container,ctx)=>ctx.addChild(new DeskBlock(container,this)));
    this.addRibbonIcon('sprout','打开个人工作台',()=>this.openDesk());
    this.addCommand({id:'open-desk',name:'打开个人工作台',callback:()=>this.openDesk()});
    this.addCommand({id:'open-today',name:'打开今日记录',callback:()=>this.openDaily().catch(e=>new Notice(e.message))});
    this.addSettingTab(new DeskSettings(this.app,this));
    const schedule=()=>{window.clearTimeout(this.refreshTimeout);this.refreshTimeout=window.setTimeout(()=>{for(const d of this.desks)d.refresh();},180);};
    this.registerEvent(this.app.metadataCache.on('changed',file=>{if(this.eligible(file.path))schedule();}));
    for(const name of ['delete','rename','create'])this.registerEvent(this.app.vault.on(name,schedule));
    this.registerInterval(window.setInterval(()=>{for(const d of this.desks)d.updateTimer();if(this.data.timer.state==='running'&&this.remaining()<=0&&!this.finishing&&Date.now()>=this.nextRetry)this.finishTimer().catch(()=>{});},1000));
    this.registerInterval(window.setInterval(schedule,60000));
    this.app.workspace.onLayoutReady(()=>{if(this.data.openOnStartup)this.openDesk();});
  }
  onunload(){window.clearTimeout(this.refreshTimeout);for(const d of [...this.desks])d.destroy();}
  eligible(path){return (path.startsWith('projects/')||path.startsWith('wiki/'))&&path.endsWith('.md')&&!path.includes('/设计预览/')&&!path.endsWith('/设计说明.md')&&!path.includes('/plugin/');}
  async getTasks(){
    const files=this.app.vault.getMarkdownFiles().filter(f=>this.eligible(f.path)&&(this.app.metadataCache.getFileCache(f)?.listItems||[]).some(i=>i.task!==undefined));
    const groups=await Promise.all(files.map(async file=>{const text=await this.app.vault.cachedRead(file),lines=text.split('\n');return (this.app.metadataCache.getFileCache(file)?.listItems||[]).filter(i=>[' ','x','X'].includes(i.task)).flatMap(item=>{const raw=lines[item.position.start.line];if(!raw)return[];const match=raw.match(/^\s*[-*+] \[([ xX])\]\s+(.*)/);if(!match)return[];const due=match[2].match(/(?:📅|⏳)\s*(\d{4}-\d{2}-\d{2})/);return [{path:file.path,line:item.position.start.line,raw,done:match[1].toLowerCase()==='x',due:due?.[1]||'',text:safeText(match[2].replace(/(?:📅|⏳|✅)\s*\d{4}-\d{2}-\d{2}/g,'').replace(/(?:^|\s)#(?:today|今日)(?=\s|$)/g,'')).trim(),project:file.path.startsWith(DAILY+'/')?'每日记录':file.path.split('/')[1]}];});}));
    return groups.flat().sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||a.path.localeCompare(b.path)||a.line-b.line);
  }
  async toggleTask(task,done){if(!this.eligible(task.path))throw new Error('这个位置不支持修改任务。');const file=this.app.vault.getAbstractFileByPath(task.path);if(!file)throw new Error('源笔记已不存在。');await this.app.vault.process(file,data=>replaceTask(data,task,done));}
  async ensureFolders(path){const parts=path.split('/');let parent='';for(const p of parts){parent=parent?parent+'/'+p:p;if(!this.app.vault.getAbstractFileByPath(parent)){try{await this.app.vault.createFolder(parent);}catch(e){if(!this.app.vault.getAbstractFileByPath(parent))throw e;}}}}
  async ensureDaily(day=today()){
    const path=`${DAILY}/${day}.md`;let file=this.app.vault.getAbstractFileByPath(path);if(file)return file;
    await this.ensureFolders(DAILY);let template=this.app.vault.getAbstractFileByPath('templates/工作台每日记录模板.md');
    const source=template?await this.app.vault.read(template):`---\nstatus: active\ntype: daily\ntags: [daily]\ncreated: ${day}\nupdated: ${day}\nsources: []\n---\n\n# ${day}\n\n## 今日待办\n\n## 工作记录\n\n## 专注记录\n\n## 日终回顾\n`;
    const content=source.replaceAll('{{date:YYYY-MM-DD}}',day).replaceAll('{{date}}',day).replaceAll('{{title}}',day);
    try{return await this.app.vault.create(path,content);}catch(e){file=this.app.vault.getAbstractFileByPath(path);if(file)return file;throw e;}
  }
  async addTask(text,due=today()){
    text=String(text).replace(/[\r\n]+/g,' ').trim();if(!text)throw new Error('先写下要完成的事。');if(text.length>500)throw new Error('任务内容请保持在 500 字以内。');if(due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!moment(due,'YYYY-MM-DD',true).isValid()))throw new Error('请选择有效的计划日期。');
    const file=await this.ensureDaily();await this.app.vault.process(file,data=>appendSection(data,'今日待办',`- [ ] ${text}${due?' 📅 '+due:''}`));return file;
  }
  async openDaily(){const file=await this.ensureDaily();await this.openNote(file.path);}
  async openNote(path,line,original=false){
    if(line===undefined&&!original&&this.isDirectory(path))return this.openDirectory(path);
    const file=this.app.vault.getAbstractFileByPath(path)||this.app.metadataCache.getFirstLinkpathDest(path,HOME);
    if(!file){new Notice('没有找到笔记：'+path);return;}
    const leaf=this.app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path===file.path)||this.app.workspace.getLeaf('tab');await leaf.openFile(file,{active:true,...(line===undefined?{}:{eState:{line}})});if(line===undefined&&file.extension==='md')await leaf.setViewState({type:'markdown',state:{...leaf.view.getState(),mode:'preview'}});await this.app.workspace.revealLeaf(leaf);this.app.workspace.setActiveLeaf(leaf,{focus:true});this.decorateNotes();
  }
  projectFiles(){
    const names={'Ego项目':['Ego 数据采集','多相机 · 同步与质量控制'],'OpenPI-Training-Deployment':['OpenPI 训练与部署','策略训练 · 真机验证'],'WujiArm-VR-Teleoperation':['WujiArm VR 遥操作','Quest 3 · 双臂控制'],'OpenArm-ROS2-Control':['OpenArm / ROS2 控制','机器人工程 · 控制'],'OpenArm-VLA-Data-Collection':['OpenArm VLA 数据采集','采集系统 · 数据组织'],'AI-Knowledge-Base':['AI + Obsidian 知识库','知识积累 · 工作流']};
    return this.app.vault.getMarkdownFiles().filter(f=>f.path.startsWith('projects/')&&f.basename==='_context'&&f.path!== 'projects/个人工作台/_context.md').map(f=>{const dir=f.path.split('/')[1],pair=names[dir]||[dir,'项目上下文'];return{path:f.path,title:pair[0],subtitle:pair[1]};}).sort((a,b)=>{const ids=Object.keys(names);const score=x=>{const n=ids.indexOf(x.path.split('/')[1]);return n<0?999:n;};return score(a)-score(b);});
  }
  pickProjects(){return this.openDirectory('项目总览');}
  async openDesk(){
    if(this.openingDesk)return this.openingDesk;
    this.openingDesk=(async()=>{let leaf=this.app.workspace.getLeavesOfType(VIEW)[0];if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:VIEW,active:true});}if(leaf.isDeferred)await leaf.loadIfDeferred();await this.app.workspace.revealLeaf(leaf);this.app.workspace.setActiveLeaf(leaf,{focus:true});if(leaf.view.desk)await leaf.view.desk.refresh();return leaf;})();
    try{return await this.openingDesk;}finally{this.openingDesk=null;}
  }
  remaining(){const t=this.data.timer;return t.state==='running'?Math.max(0,t.endsAt-Date.now()):t.remainingMs;}
  transact(fn){const operation=this.queue.then(async()=>{const next=JSON.parse(JSON.stringify(this.data));await fn(next);await this.saveData(next);this.data=next;for(const desk of this.desks)desk.updateTimer();});this.queue=operation.catch(()=>{});return operation;}
  async setFocus(label){await this.transact(d=>{if(d.timer.state!=='idle')throw new Error('本次计时已开始，请暂停后完成或重置，再更换任务。');d.timer.label=label;});new Notice('专注内容已设为：'+label);}
  async changePhase(phase){if(!['focus','short','long'].includes(phase))throw new Error('未知计时模式。');await this.transact(d=>{if(d.timer.state!=='idle')throw new Error('请先重置本次计时。');d.timer.phase=phase;d.timer.remainingMs=d.timer.totalMs=d.durations[phase]*60000;d.timer.id=null;});}
  async timerAction(){
    if(this.data.timer.state==='running'&&this.remaining()<=0)return this.finishTimer();
    await this.transact(d=>{const t=d.timer;if(t.state==='running'){t.remainingMs=Math.max(0,t.endsAt-Date.now());t.endsAt=null;t.state='paused';}else{t.id=t.id||('zd-'+Date.now()+'-'+Math.random().toString(36).slice(2,9));t.endsAt=Date.now()+t.remainingMs;t.state='running';}});
  }
  async resetTimer(){await this.transact(d=>{const t=d.timer;t.remainingMs=t.totalMs=d.durations[t.phase]*60000;t.state='idle';t.endsAt=null;t.id=null;});this.timerError='';for(const d of this.desks)d.updateTimer();}
  async finishTimer(){
    if(this.finishing||this.data.timer.state!=='running'||this.remaining()>0)return;
    this.finishing=true;for(const d of this.desks)d.updateTimer();
    try{await this.transact(async d=>{const t=d.timer;if(t.state!=='running'||t.endsAt>Date.now())return;
      if(t.phase==='focus'){const completed=moment(t.endsAt),day=completed.format('YYYY-MM-DD'),file=await this.ensureDaily(day);const marker=`<!-- zhixing-session:${t.id} -->`;const label=(t.label||'自由专注').replace(/[\r\n]/g,' ');const line=`- ${completed.format('HH:mm')} · 专注 ${Math.round(t.totalMs/60000)} 分钟 · ${label} ${marker}`;await this.app.vault.process(file,data=>data.includes(marker)?data:appendSection(data,'专注记录',line));}
      t.phase=t.phase==='focus'?'short':'focus';t.state='idle';t.remainingMs=t.totalMs=d.durations[t.phase]*60000;t.endsAt=null;t.id=null;
    });this.timerError='';this.nextRetry=0;new Notice(this.data.timer.phase==='short'?'这一段专注已记录。休息一下吧。':'休息结束，可以开始下一件事。');}
    catch(e){this.timerError='专注结果尚未保存：'+e.message;this.nextRetry=Date.now()+30000;new Notice(this.timerError);throw e;}
    finally{this.finishing=false;for(const d of this.desks){d.updateTimer();d.refresh();}}
  }
};
module.exports.testing={replaceTask,appendSection};
