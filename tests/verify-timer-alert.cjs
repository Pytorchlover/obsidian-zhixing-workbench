const assert=require('node:assert/strict');
const Module=require('node:module');
const original=Module._load;
const moment=stamp=>({format:format=>format==='YYYY-MM-DD'?'2026-10-24':'12:00'});
Module._load=function(name,...args){if(name==='obsidian')return {Plugin:class{},ItemView:class{},MarkdownRenderChild:class{},FuzzySuggestModal:class{},PluginSettingTab:class{},Notice:class{},moment};return original.call(this,name,...args);};
const Plugin=require('../src/main');Module._load=original;
const {TimerAlert,markup}=require('../src/timer-alert');
function plugin(){const p=new Plugin();p.data={durations:{focus:25,short:5,long:15},timer:{phase:'focus',state:'running',endsAt:Date.now()-3000,totalMs:1500000,remainingMs:0,label:'测试任务',id:'session-a'}};p.desks=new Set();p.queue=Promise.resolve();p.finishing=false;p.nextRetry=0;p.ensureDaily=async()=>({});p.log='';p.app={vault:{process:async(_,fn)=>{p.log=fn(p.log);}}};p.saveData=async data=>{p.saved=JSON.parse(JSON.stringify(data));};p.alerts=[];p.timerAlert={show:a=>p.alerts.push(a),close:()=>{}};return p;}
(async()=>{
 let p=plugin();await Promise.all([p.finishTimer(),p.finishTimer(),p.finishTimer()]);assert.equal(p.alerts.length,1);assert.equal((p.log.match(/zhixing-session:session-a/g)||[]).length,1);assert.equal(p.saved.pendingTimerAlert.id,'session-a');assert.equal(p.data.timer.phase,'short');assert.equal(p.data.timer.state,'idle');
 await p.finishTimer();assert.equal(p.alerts.length,1);
 await p.handleTimerAlert('start','old-window');assert.equal(p.data.timer.state,'idle');assert.equal(p.data.pendingTimerAlert.id,'session-a');
 await p.handleTimerAlert('start','session-a');assert.equal(p.data.timer.phase,'short');assert.equal(p.data.timer.state,'running');assert.equal(p.data.timer.totalMs,300000);assert.equal(p.data.pendingTimerAlert,null);
 p.data.timer.endsAt=Date.now()-1000;await p.finishTimer();assert.equal(p.alerts.length,2);assert.equal(p.data.pendingTimerAlert.phase,'short');assert.equal((p.log.match(/zhixing-session/g)||[]).length,1);await p.handleTimerAlert('start',p.data.pendingTimerAlert.id);assert.equal(p.data.timer.phase,'focus');assert.equal(p.data.timer.totalMs,1500000);
 p=plugin();await p.finishTimer();await p.handleTimerAlert('extend','session-a');assert.equal(p.data.timer.totalMs,300000);assert.equal(p.data.timer.phase,'focus');assert.equal(p.data.timer.label,'测试任务');
 p=plugin();await p.finishTimer();await p.handleTimerAlert('dismiss','session-a');assert.equal(p.data.timer.state,'idle');assert.equal(p.data.pendingTimerAlert,null);
 p=plugin();p.saveData=async()=>{throw Error('disk full')};await assert.rejects(()=>p.finishTimer(),/disk full/);assert.equal(p.data.timer.state,'running');assert.equal(p.alerts.length,0);p.saveData=async()=>{};p.nextRetry=0;await p.finishTimer();assert.equal((p.log.match(/zhixing-session:session-a/g)||[]).length,1);assert.equal(p.alerts.length,1);
 // Validate a background/wake check with no mounted dashboard.
 p=plugin();await new Promise(resolve=>{p.finishTimer=async()=>resolve();p.checkTimer();});
 const html=markup({phase:'focus',label:'<script>alert(1)</script> & task',totalMs:1500000,completedAt:Date.now()},true);assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('default-src'));assert(html.includes('zhixing-timer://extend'));
 // Native surface: inactive, topmost, no privileged page, duplicate display is suppressed.
 let count=0,beeps=0,shown=0;const listeners={};let options;
 class Win {constructor(opts){options=opts;count++;this.webContents={setWindowOpenHandler:fn=>this.open=fn,on:(n,fn)=>{listeners[n]=fn}};}setAlwaysOnTop(){}setVisibleOnAllWorkspaces(){}once(n,fn){listeners[n]=fn}on(n,fn){listeners[n]=fn}loadURL(){return Promise.resolve()}isDestroyed(){return !!this.dead}showInactive(){shown++}destroy(){this.dead=true}}
 const remote={BrowserWindow:Win,nativeTheme:{shouldUseDarkColors:true}};const host={data:{timerSound:true},handleTimerAlert:async()=>{}};const surface=new TimerAlert(host,{remote,beep:()=>beeps++});const alert={id:'a',phase:'focus',label:'安全任务',totalMs:1500000,completedAt:Date.now()};surface.show(alert);surface.show(alert);listeners['ready-to-show']();assert.equal(count,1);assert.equal(shown,1);assert.equal(beeps,1);assert.equal(options.show,false);assert.equal(options.webPreferences.nodeIntegration,false);assert.equal(options.webPreferences.sandbox,true);assert.equal(options.alwaysOnTop,true);let prevented=0;listeners['will-navigate']({preventDefault(){prevented++}},'https://example.com');assert.equal(prevented,1);surface.close();assert.equal(surface.window,null);
 console.log('PASS: timer completion, persistence, retry deduplication, stale actions, break/extend, background expiry and secure inactive native popup');
})().catch(e=>{console.error(e);process.exit(1)});
