'use strict';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const actions = new Set(['start','extend','dismiss']);
function markup(alert, dark) {
  const focus=alert.phase==='focus';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>
  :root{color-scheme:${dark?'dark':'light'};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:${dark?'#202320':'#f8f7f2'};color:${dark?'#e9ece5':'#29382d'}}*{box-sizing:border-box}body{margin:0;padding:28px 30px}small{color:${dark?'#aab8aa':'#617264'};letter-spacing:2px;font-size:11px}h1{font-size:25px;font-weight:600;margin:18px 0 12px}p{font-size:14px;line-height:1.7;margin:0;overflow-wrap:anywhere}.task{max-height:78px;overflow:auto;color:${dark?'#c1cbc0':'#56675a'}}.meta{margin-top:12px;color:${dark?'#aab8aa':'#617264'};font-size:12px}.buttons{display:flex;gap:8px;margin-top:25px;flex-wrap:wrap}a{font-size:13px;text-decoration:none;color:inherit;border:1px solid ${dark?'#526253':'#cbd4c8'};border-radius:9px;padding:10px 15px}a.primary{background:${dark?'#9bb295':'#46634d'};color:${dark?'#152318':'#fff'};border-color:transparent}a:focus-visible{outline:2px solid #8aa77e;outline-offset:3px}</style></head><body>
  <small>知行之间 · ${focus?'专注完成':'休息结束'}</small><h1>${focus?'这一段，完成了。':'休息好了，再出发。'}</h1>
  <p class="task">${escape(alert.label||'自由专注')}</p><p class="meta">${focus?'本轮专注':'本轮休息'} ${Math.round(alert.totalMs/60000)} 分钟 · ${escape(new Date(alert.completedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}))} 结束</p>
  <div class="buttons"><a class="primary" href="zhixing-timer://start">${focus?'开始休息':'开始专注'}</a>${focus?'<a href="zhixing-timer://extend">再专注 5 分钟</a>':''}<a href="zhixing-timer://dismiss">关闭</a></div></body></html>`;
}
class TimerAlert {
  constructor(plugin, {remote, beep}={}) {this.plugin=plugin;this.remote=remote;this.beep=beep;this.window=null;this.id=null;this.busy=false;}
  show(alert, {silent=false}={}) {
    if(this.window&&!this.window.isDestroyed()&&this.id===alert.id)return;
    this.close();
    try {
      const remote=this.remote||require('@electron/remote');
      const win=new remote.BrowserWindow({width:460,height:320,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,show:false,alwaysOnTop:true,autoHideMenuBar:true,title:'知行之间 · 计时提醒',backgroundColor:remote.nativeTheme.shouldUseDarkColors?'#202320':'#f8f7f2',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,devTools:false}});
      this.window=win;this.id=alert.id;
      win.setAlwaysOnTop(true,'floating');
      win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
      win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      win.webContents.on('will-navigate',(event,url)=>{event.preventDefault();const match=/^zhixing-timer:\/\/(start|extend|dismiss)\/?$/.exec(url);if(match)this.run(match[1],alert.id);});
      win.once('ready-to-show',()=>{if(!win.isDestroyed())win.showInactive();});
      win.on('close',event=>{if(this.closing)return;event.preventDefault();this.run('dismiss',alert.id);});
      win.on('closed',()=>{if(this.window===win){this.window=null;this.id=null;}});
      win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(markup(alert,remote.nativeTheme.shouldUseDarkColors))).catch(e=>this.fallback(alert,e));
      if(!silent&&this.plugin.data.timerSound!==false){try{(this.beep||require('electron').shell.beep)();}catch{}}
    } catch(e) {this.fallback(alert,e);}
  }
  async run(action,id) {
    if(this.busy||!actions.has(action))return;
    this.busy=true;
    try {await this.plugin.handleTimerAlert(action,id);this.close();}
    catch(e){const {Notice}=require('obsidian');new Notice('计时提醒操作未保存：'+e.message);}
    finally{this.busy=false;}
  }
  fallback(alert,error) {
    this.close();
    const {Notice}=require('obsidian');new Notice('无法打开独立提醒窗口，请检查计时提醒：'+error.message,10000);
    try{const n=new Notification(alert.phase==='focus'?'专注完成':'休息结束',{body:alert.label||'自由专注',requireInteraction:true});n.onclick=()=>this.plugin.openDesk();}catch{}
  }
  close(){const win=this.window;this.window=null;this.id=null;if(win&&!win.isDestroyed()){this.closing=true;try{win.destroy();}finally{this.closing=false;}}}
}
module.exports={TimerAlert,markup};
