'use strict';
const {createHash}=require('crypto');
const {arxivId}=require('./paper-core');
const figures=require('./paper-figures');
const ROOT='projects/个人工作台/每日推荐/配图';
const text=s=>String(s||'').replace(/\s+/g,' ').trim();
function figureScore(caption,index=0){
 const s=text(caption).toLowerCase();let score=Math.max(0,12-index);
 if(/overview|architecture|framework|pipeline|method overview|system overview|整体|架构|框架|流程/.test(s))score+=40;
 if(/teaser|our (?:method|approach|system)|we propose/.test(s))score+=14;
 if(/ablation|quantitative|comparison|performance|benchmark|消融|定量|性能/.test(s))score-=18;
 return score;
}
function htmlCandidates(html,id,Parser=globalThis.DOMParser){
 if(typeof html!=='string'||html.length>4000000)return[];
 const doc=new Parser().parseFromString(html,'text/html'),out=[];
 for(const [index,node] of Array.from(doc.querySelectorAll('figure')).entries()){
  const caption=text(node.querySelector('figcaption')?.textContent);if(!/^(?:Figure|Fig\.?|图)\s*[0-9]/i.test(caption))continue;
  const images=Array.from(node.querySelectorAll('img'));if(images.length!==1)continue; // Never present a single panel as the whole multi-panel figure.
  let url;try{url=new URL(images[0].getAttribute('src'),`https://arxiv.org/html/${id}`);}catch{continue;}
  if(url.protocol!=='https:'||url.hostname!=='arxiv.org'||url.port||url.username||url.password||!url.pathname.startsWith(`/html/${id}/`)||!/[.](?:png|jpe?g|webp)$/i.test(url.pathname))continue;
  out.push({url:url.href,source:`https://arxiv.org/html/${id}#${encodeURIComponent(node.id)}`,caption:caption.slice(0,1800),label:caption.match(/^(?:Figure|Fig\.?|图)\s*[0-9]+[a-z]?/i)?.[0]||'论文配图',score:figureScore(caption,index)});
 }
 return out.sort((a,b)=>b.score-a.score);
}
function imageType(bytes){const b=Buffer.from(bytes);if(b.length>24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return'png';if(b.length>3&&b[0]===255&&b[1]===216&&b[2]===255)return'jpg';if(b.length>12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return'webp';return null;}
function createImageService(plugin,{request,loadPdfJs,parse=htmlCandidates,now=Date.now,pause=ms=>new Promise(r=>setTimeout(r,ms)),interval=3100,timeout=30000,dimensions=bytes=>require('electron').nativeImage.createFromBuffer(Buffer.from(bytes)).getSize()}={}){
 const vault=plugin.app.vault,pending=new Map();let closed=false,tail=Promise.resolve(),last=-Infinity;
 const folder=id=>`${ROOT}/${createHash('sha256').update(id).digest('hex').slice(0,24)}`;
 const check=()=>{if(closed)throw Error('插件已关闭。');};
 async function fetch(url){check();const wait=interval-(now()-last);if(wait>0)await pause(wait);check();last=now();let timer;try{return await Promise.race([request({url,throw:false}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('配图请求超时')),timeout);})]);}finally{clearTimeout(timer);}}
 async function cached(id){const file=vault.getAbstractFileByPath(folder(id)+'/figure.json');if(!file)return null;let record;try{record=JSON.parse(await vault.read(file));}catch{return null;}if(record.version!==1||record.id!==id)return null;if(record.kind==='image'){if(!record.figure?.path?.startsWith(folder(id)+'/')||record.figure.path.includes('..')||!vault.getAbstractFileByPath(record.figure.path))return null;return record;}const ttl=record.kind==='unavailable'?86400000:300000;return now()-record.checkedAt<ttl?record:null;}
 async function save(id,record){check();const path=folder(id)+'/figure.json';await plugin.ensureFolders(folder(id));check();const file=vault.getAbstractFileByPath(path),raw=JSON.stringify(record,null,2);if(file)await vault.modify(file,raw);else await vault.create(path,raw);return record;}
 async function store(id,bytes,figure){check();if(bytes.byteLength>8*1024*1024)throw Error('配图超过 8 MB');const ext=imageType(bytes);if(!ext)throw Error('配图格式不受支持');const size=dimensions(bytes);if(size.width<250||size.height<80||size.width*size.height>40000000)throw Error('配图尺寸无效');const hash=createHash('sha256').update(Buffer.from(bytes)).digest('hex').slice(0,16),path=`${folder(id)}/${hash}.${ext}`;await plugin.ensureFolders(folder(id));check();if(!vault.getAbstractFileByPath(path)){const b=Buffer.from(bytes);await vault.createBinary(path,b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}return save(id,{version:1,id,kind:'image',checkedAt:now(),figure:{...figure,path,width:size.width,height:size.height}});}
 async function fromPdf(id){
  const response=await fetch('https://arxiv.org/pdf/'+id);if(response.status!==200)throw Error('原文 PDF 暂时无法获取');const bytes=new Uint8Array(response.arrayBuffer);if(bytes.byteLength>35*1024*1024)throw Error('原文 PDF 超过配图预览的 35 MB 上限');if(Buffer.from(bytes.subarray(0,1024)).indexOf('%PDF-')<0)throw Error('原文 PDF 格式无效');
  const lib=await loadPdfJs();let doc;try{doc=await lib.getDocument({data:bytes,isEvalSupported:false}).promise;const choices=[];for(let n=1;n<=Math.min(doc.numPages,8);n++){check();const page=await doc.getPage(n),viewport=page.getViewport({scale:1}),lines=figures.textLines((await page.getTextContent()).items,viewport);if(!lines.some(l=>/^(?:Figure|Fig\.?|图)\s*[0-9]/i.test(l.text))){page.cleanup();continue;}const graphics=figures.graphicsBounds(await page.getOperatorList(),lib.OPS,viewport);for(const f of figures.candidates(lines,graphics,viewport.width,viewport.height))choices.push({...f,page:n,score:figureScore(f.caption,n-1)});page.cleanup();}
   choices.sort((a,b)=>b.score-a.score);const f=choices[0];if(!f)return null;check();const page=await doc.getPage(f.page),base=page.getViewport({scale:1}),scale=Math.min(2,1600/(f.rect[2]-f.rect[0])),view=page.getViewport({scale}),canvas=document.createElement('canvas'),crop=document.createElement('canvas');
   try{canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:view,background:'#fff'}).promise;check();const [x,y,right,bottom]=f.rect;crop.width=Math.ceil((right-x)*scale);crop.height=Math.ceil((bottom-y)*scale);crop.getContext('2d').drawImage(canvas,x*scale,y*scale,(right-x)*scale,(bottom-y)*scale,0,0,crop.width,crop.height);const bytes=Buffer.from(crop.toDataURL('image/png').split(',')[1],'base64');return await store(id,bytes,{label:f.label,caption:f.caption,page:f.page,source:'https://arxiv.org/pdf/'+id+'#page='+f.page,origin:'pdf'});}finally{canvas.width=canvas.height=crop.width=crop.height=0;}
  }finally{await doc?.destroy();}
 }
 async function perform(id,force){if(!force){const hit=await cached(id);if(hit)return hit;}let htmlError=false;try{const response=await fetch('https://arxiv.org/html/'+id);if(response.status===200){const choices=parse(response.text,id);for(const f of choices.slice(0,3)){try{const image=await fetch(f.url);if(image.status===200)return await store(id,image.arrayBuffer,{label:f.label,caption:f.caption,source:f.source,origin:'html'});}catch{check();}}}else if(response.status!==404)htmlError=true;}catch{check();htmlError=true;}
  try{const result=await fromPdf(id);if(result)return result;return save(id,{version:1,id,kind:htmlError?'error':'unavailable',checkedAt:now(),message:'暂未识别到合适的原图，可查看论文原文。'});}catch{check();return save(id,{version:1,id,kind:'error',checkedAt:now(),message:'暂时无法获取配图，可以重试或查看论文原文。'});}
 }
 async function get(paper,{force=false}={}){const id=arxivId(paper?.id);if(!id)throw Error('论文编号无效');check();if(!force){const hit=await cached(id);if(hit)return hit;}check();if(pending.has(id))return pending.get(id);const job=tail.catch(()=>{}).then(()=>perform(id,force));tail=job;pending.set(id,job);try{return await job;}finally{pending.delete(id);}}
 async function prefetch(items){for(const paper of items){if(closed)return;try{await get(paper);}catch{if(closed)return;}}}
 plugin.register(()=>{closed=true;});return{get,prefetch,cached:paper=>cached(arxivId(paper?.id)||''),resource:figure=>vault.adapter.getResourcePath(figure.path),busy:()=>pending.size>0};
}
module.exports={figureScore,htmlCandidates,imageType,createImageService,ROOT};
