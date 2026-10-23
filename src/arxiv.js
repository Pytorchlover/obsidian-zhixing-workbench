'use strict';
const {arxivId}=require('./paper-core');
const ATOM='http://www.w3.org/2005/Atom';
const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
const baseId=value=>arxivId(value)?.replace(/v[0-9]+$/,'')||null;
function queryUrl({query,field='all',sort='relevance',start=0,size=10,since='',categories=[]}={}){
 const text=clean(query);
 if(!text||text.length>300)throw Error('请输入 1–300 字的关键词、标题、作者或 arXiv 编号。');
 if(!['all','ti','au'].includes(field)||!['relevance','submittedDate','lastUpdatedDate'].includes(sort))throw Error('搜索条件无效。');
 if(!Number.isInteger(start)||start<0||start>10000||!Number.isInteger(size)||size<1||size>20)throw Error('搜索页码无效，请缩小关键词范围。');
 const id=arxivId(text),params=new URLSearchParams({start:String(start),max_results:String(size),sortBy:sort,sortOrder:'descending'});
 if(id)params.set('id_list',id);
 else{
  const tokens=text.match(/"[^"]+"|[^\s"]+/g)||[];
  params.set('search_query',tokens.map(token=>`${field}:${token.startsWith('"')?token:'"'+token+'"'}`).join(' AND '));
 }
 if(since||categories.length){
  if(id)throw Error('编号搜索不支持时间或领域过滤。');
  if(since&&!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(since))throw Error('搜索日期无效。');
  if(!Array.isArray(categories)||categories.length>10||categories.some(x=>!/^cs\.[A-Z]{2}$/.test(x)))throw Error('领域过滤无效。');
  let q='('+params.get('search_query')+')';
  if(since)q+=' AND submittedDate:['+since.replaceAll('-','')+'0000 TO 299912312359]';
  if(categories.length)q+=' AND ('+categories.map(x=>'cat:'+x).join(' OR ')+')';
  params.set('search_query',q);
 }
 return 'https://export.arxiv.org/api/query?'+params;
}
function parseFeed(xml,Parser=globalThis.DOMParser){
 if(typeof xml!=='string'||xml.length>3000000)throw Error('arXiv 返回的数据过大或格式无效。');
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('arXiv 返回了不支持的 XML 格式。');
 const dom=new Parser().parseFromString(xml,'text/xml');
 const nodes=(parent,name,ns=ATOM)=>Array.from(parent.getElementsByTagNameNS(ns,name));
 const text=(parent,name,ns)=>clean(nodes(parent,name,ns)[0]?.textContent);
 if(dom.getElementsByTagName('parsererror').length||dom.documentElement?.localName!=='feed')throw Error('arXiv 返回格式异常，请稍后重试。');
 const entries=nodes(dom,'entry');
 if(entries.some(entry=>text(entry,'id').includes('/api/errors')))throw Error('arXiv 未接受搜索条件，请简化关键词后重试。');
 const items=entries.map(entry=>{
  const id=arxivId(text(entry,'id'));if(!id)return null;
  const categoryNodes=nodes(entry,'category'),categories=categoryNodes.map(n=>n.getAttribute('term')).filter(Boolean);
  return {id,title:text(entry,'title').slice(0,600),authors:nodes(entry,'author').map(n=>text(n,'name')).join(', ').slice(0,2000),abstract:text(entry,'summary').slice(0,16000),published:text(entry,'published').slice(0,10),updated:text(entry,'updated').slice(0,10),categories:categories.slice(0,20),doi:text(entry,'doi','http://arxiv.org/schemas/atom').slice(0,300),source:'https://arxiv.org/abs/'+id};
 }).filter(Boolean);
 const total=Number(text(dom,'totalResults','http://a9.com/-/spec/opensearch/1.1/'));
 return {items,total:Number.isSafeInteger(total)&&total>=0?total:items.length};
}
function createSearch({request,parse=parseFeed,now=Date.now,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),interval=3100,timeout=30000}={}){
 let tail=Promise.resolve(),last=-Infinity,closed=false;
 const cache=new Map(),pending=new Map();
 async function search(options){
  if(closed)throw Error('插件已关闭，请重新打开论文库。');
  const url=queryUrl(options),cached=cache.get(url);
  if(cached&&now()-cached.at<300000)return structuredClone(cached.result);
  if(pending.has(url))return structuredClone(await pending.get(url));
  const work=tail.catch(()=>{}).then(async()=>{
   const wait=interval-(now()-last);if(wait>0)await pause(wait);
   if(closed)throw Error('插件已关闭。');
   last=now();let timer;
   try{
    const response=await Promise.race([request({url,throw:false,headers:{Accept:'application/atom+xml'}}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('arXiv 搜索超时，请稍后重试。')),timeout);})]);
    if(response.status!==200)throw Error(response.status===429?'arXiv 请求较多，请稍后重试。':`arXiv 暂时不可用（HTTP ${response.status}），请稍后重试。`);
    const result=parse(response.text);cache.set(url,{at:now(),result});if(cache.size>20)cache.delete(cache.keys().next().value);return result;
   }catch(e){if(/^arXiv|^插件/.test(e.message||''))throw e;throw Error('无法连接 arXiv，请检查网络后重试。');}finally{clearTimeout(timer);}
  });
  tail=work;pending.set(url,work);
  try{return structuredClone(await work);}finally{pending.delete(url);}
 }
 return {search,close:()=>{closed=true;cache.clear();}};
}
module.exports={baseId,queryUrl,parseFeed,createSearch};
