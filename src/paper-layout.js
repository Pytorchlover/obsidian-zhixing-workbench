'use strict';
const {spawn}=require('child_process');
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
module.exports=function layoutService(plugin,service){
 const base=path.join(os.homedir(),'.local/share/zhixing-pdf2zh'),python=path.join(base,'venv/bin/python');let active=null,lastFailure=null,reserved=false,stopped=false;
 function cancel(){if(!active)return;active.cancelled=true;try{process.platform==='win32'?active.child.kill():process.kill(-active.child.pid,'SIGTERM');}catch{}}
 async function perform(id,progress=()=>{},options={}){
  if(active)throw new Error('已有 PDF 翻译正在进行，请等待完成。');
  if(!fs.existsSync(python))throw new Error('本机 PDF 翻译引擎尚未安装，请查看工作台使用指南。');
  const paper=await service.load(id);if(stopped)throw new Error('插件已关闭。');if(paper.layoutPdf?.monoPath&&paper.layoutPdf?.dualPath&&!options.force&&await plugin.app.vault.adapter.exists(paper.layoutPdf.monoPath)&&await plugin.app.vault.adapter.exists(paper.layoutPdf.dualPath))return paper;
  const key=plugin.dailyServices.store().data.key;if(!key)throw new Error('请先配置 MiniMax 密钥。');
  const vault=plugin.app.vault,root=vault.adapter.getBasePath(),worker=path.join(root,plugin.manifest.dir,'pdf-layout-worker.py'),input=path.join(root,paper.pdfPath);
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'zhixing-layout-'));let result;progress('正在准备版式分析与翻译…');
  const child=spawn(python,['-u',worker],{stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32',env:{...process.env,PYTHONUNBUFFERED:'1',OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1',VECLIB_MAXIMUM_THREADS:'1'}}),job={child,cancelled:false};active=job;
  try{result=await new Promise((resolve,reject)=>{let buffer='',finished=null,failed=false;const timer=setTimeout(()=>{cancel();},45*60*1000);const close=(error)=>{clearTimeout(timer);error?reject(error):resolve(finished);};
   child.stdout.on('data',chunk=>{buffer+=chunk.toString();if(buffer.length>1000000)buffer=buffer.slice(-100000);let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);if(!line.startsWith('ZDPDF:'))continue;try{const event=JSON.parse(line.slice(6));if(event.type==='finish')finished=event;else if(event.type==='error'){failed=true;lastFailure=event;}else if(event.type==='progress')progress(`正在生成译文 PDF · ${event.percent}% · ${stageName(event.stage)}`);}catch{}}});
   // Never expose third-party stderr (it may contain a request payload).
   child.stderr.on('data',()=>{});child.on('error',()=>close(new Error('无法启动本机 PDF 翻译引擎。')));child.on('close',(code,signal)=>{if(!finished&&!failed&&!job.cancelled)lastFailure={kind:'WorkerExit',code,signal};if(job.cancelled)return close(new Error('PDF 翻译已停止，原文与已有译文保留。'));if(code!==0||failed||!finished)return close(new Error('PDF 生成失败，请检查网络、引擎依赖与 MiniMax 额度后重试；原文和已有译文保留。'));close();});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({input,output,key})+'\n');});
   if(result.sourcePages!==paper.pages.length||result.monoPages!==paper.pages.length||result.dualPages!==paper.pages.length)throw new Error('译文 PDF 页数不匹配，未替换已有文件。');
   const folder=`projects/个人工作台/论文库/${id}/pdf`;await plugin.ensureFolders(folder);const stamp=crypto.randomBytes(6).toString('hex'),paths={};
   for(const [kind,source]of [['mono',result.mono],['dual',result.dual]]){const real=fs.realpathSync(source);if(!real.startsWith(fs.realpathSync(output)+path.sep))throw new Error('翻译输出路径无效。');const bytes=fs.readFileSync(real);if(bytes.subarray(0,1024).indexOf('%PDF-')<0||bytes.length<500)throw new Error('翻译输出不是有效 PDF。');const target=`${folder}/${kind==='mono'?'中文':'中英对照'}-${stamp}.pdf`;await vault.createBinary(target,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));paths[kind+'Path']=target;}
   return await service.update(id,p=>{p.layoutPdf={...paths,engine:result.engine,version:result.version,created:new Date().toISOString(),mode:'side-by-side',pageCount:result.sourcePages};});
  }finally{active=null;fs.rmSync(output,{recursive:true,force:true});}
 }
 function stageName(s){if(/translat/i.test(s))return '翻译正文';if(/layout/i.test(s))return '识别版式';if(/font/i.test(s))return '处理字体';if(/save|PDF Creation|Create PDF/i.test(s))return '输出 PDF';if(/parse|intermediate/i.test(s))return '解析 PDF';if(/scan/i.test(s))return '检查文本';return '处理版式';}
 async function generate(...args){if(reserved)throw new Error('已有 PDF 翻译正在进行，请等待完成。');reserved=true;try{return await perform(...args);}finally{reserved=false;}}
 plugin.register(()=>{stopped=true;cancel();});return{generate,cancel,isRunning:()=>!!active,diagnostic:()=>lastFailure};
};
