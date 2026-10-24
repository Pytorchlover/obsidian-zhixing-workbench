'use strict';
const ID=/^[a-f0-9]{24}$/;
const ROOT='projects/个人工作台/论文库';
const MODEL='MiniMax-M3.1-Flash';
const PDF_MAX_MB=150,PDF_MAX_BYTES=PDF_MAX_MB*1024*1024;
const line=s=>String(s||'').replace(/[\r\n]+/g,' ').trim();
const md=s=>String(s||'').replace(/[\\`*_{}\[\]<>#!|]/g,'\\$&');
function arxivId(input){
 let value=String(input||'').trim();
 const valid=/^(?:[0-9]{4}\.[0-9]{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/[0-9]{7})(?:v[0-9]+)?$/;
 if(valid.test(value))return value;
 try{const u=new URL(value);if(!['arxiv.org','www.arxiv.org','export.arxiv.org','alphaxiv.org','www.alphaxiv.org'].includes(u.hostname)||!['https:','http:'].includes(u.protocol))return null;value=u.pathname.replace(/^\/(abs|pdf|html|overview)\//,'').replace(/\.pdf$/,'').replace(/\/$/,'');return valid.test(value)?value:null;}catch{return null;}
}
function paragraphsFromItems(items,width){
 const meaningful=items.filter(x=>x.str?.trim());if(!meaningful.length)return[];
 // Detect genuine two-column layouts from large horizontal gaps on shared baselines.
 const rows=new Map();for(const item of meaningful){const y=Math.round(item.transform[5]/3)*3;if(!rows.has(y))rows.set(y,[]);rows.get(y).push(item);}
 let gaps=0;for(const row of rows.values()){row.sort((a,b)=>a.transform[4]-b.transform[4]);if(row.some((v,i)=>i&&v.transform[4]-(row[i-1].transform[4]+row[i-1].width)>width*.1&&v.transform[4]>width*.4&&v.transform[4]<width*.7))gaps++;}
 const two=gaps>=4,groups=two?[meaningful.filter(x=>x.transform[4]<width*.48),meaningful.filter(x=>x.transform[4]>=width*.48)]:[meaningful];const result=[];
 for(const group of groups){const sorted=group.slice().sort((a,b)=>Math.abs(a.transform[5]-b.transform[5])>3?b.transform[5]-a.transform[5]:a.transform[4]-b.transform[4]);let buffer='',lastY=null,lastSize=10;
  for(const item of sorted){const y=item.transform[5],size=Math.abs(item.transform[3])||item.height||10,gap=lastY===null?0:lastY-y;if(buffer&&(gap>lastSize*1.9||buffer.length>1450)){result.push(buffer.trim());buffer='';}const str=item.str.trim();if(buffer&&/[-‐]$/.test(buffer)&&gap>3)buffer=buffer.slice(0,-1)+str;else buffer+=(buffer?' ':'')+str;lastY=y;lastSize=size;}
  if(buffer.trim())result.push(buffer.trim());
 }
 return result.flatMap(t=>{if(t.length<=1800)return[t];const out=[];for(let i=0;i<t.length;i+=1600)out.push(t.slice(i,i+1600));return out;});
}
function blocks(paper){return paper.pages.flatMap((page,i)=>page.paragraphs.map((text,j)=>({id:`p${i+1}s${j+1}`,page:i+1,text})));}
function refs(value,available){if(!Array.isArray(value))return[];return [...new Set(value.filter(x=>typeof x==='string'&&available.has(x)))].slice(0,8);}
function summary(value,paper){const available=new Set(blocks(paper).map(b=>b.id));if(!value||typeof value.titleZh!=='string'||typeof value.overview!=='string'||!value.overview.trim()||value.overview.length>10000)throw new Error('摘要格式不完整，请重试。');const parsed={titleZh:line(value.titleZh).slice(0,300),overview:value.overview,overviewRefs:refs(value.overviewRefs,available)};if(!parsed.overviewRefs.length)throw new Error('摘要缺少有效原文依据，请重试。');for(const key of ['problem','method','findings','limitations']){if(!Array.isArray(value[key])||value[key].length>15)throw new Error('摘要结构不完整。');parsed[key]=value[key].map(x=>{if(!x||typeof x.text!=='string'||!x.text.trim()||x.text.length>4000)throw new Error('摘要条目无效。');const r=refs(x.refs,available);if(!r.length)throw new Error('摘要条目缺少有效原文引用。');return{text:x.text,refs:r};});}return parsed;}
function translation(value,page){if(!Array.isArray(value?.paragraphs)||value.paragraphs.length!==page.paragraphs.length)throw new Error('译文段落未完整对应原文，请重试。');if(value.paragraphs.some(x=>typeof x!=='string'||!x.trim()||x.length>16000))throw new Error('译文内容无效，请重试。');return value.paragraphs;}
function answer(value,context){if(typeof value?.answer!=='string'||!value.answer.trim()||value.answer.length>20000)throw new Error('未收到有效回答，请重试。');const inline=[...value.answer.matchAll(/\[(p\d+s\d+)\]/g)].map(m=>m[1]);const r=refs([...(Array.isArray(value.refs)?value.refs:[]),...inline],new Set(context.map(b=>b.id)));if(!r.length&&!value.insufficient)throw new Error('回答缺少有效原文依据，请重试。');return{answer:value.answer,refs:r,insufficient:!!value.insufficient};}
function contextFor(paper,question,page=1){const all=blocks(paper);const terms=(question.toLowerCase().match(/[a-z0-9]{2,}|[\u4e00-\u9fff]/g)||[]);const aliases=[[/局限|不足|边界|缺点|未来/,'limitation limitations discussion future failure'],[/实验|结果|评估|评测/,'experiment results evaluation benchmark'],[/方法|架构|原理|创新/,'method architecture approach contribution'],[/数据|示范|演示/,'dataset demonstration data'],[/对比|区别|相比/,'baseline comparison compared'],[/性能|速度|延迟|效率/,'latency speed efficiency performance'],[/消融/,'ablation'],[/推理|采样/,'inference sampling'],[/训练|损失/,'training loss'],[/动作|控制/,'action control horizon'],[/视觉|图像/,'visual image observation']];for(const [pattern,words]of aliases)if(pattern.test(question))terms.push(...words.split(' '));const scored=all.map((b,i)=>({b,i,score:(b.page===page?1:0)+(b.page===1?1:0)+terms.reduce((n,t)=>n+(b.text.toLowerCase().includes(t)?(t.length>1?3:.3):0),0)})).sort((a,b)=>b.score-a.score||a.i-b.i);const chosen=[];let length=0;for(const item of scored){if(length+item.b.text.length>42000)continue;chosen.push(item);length+=item.b.text.length;}return chosen.sort((a,b)=>a.i-b.i).map(x=>x.b);}
function chatContext(paper,question,page,selection,scope='selection'){
 if(!selection||scope==='paper')return contextFor(paper,question,page);
 const all=blocks(paper),local=all.filter(b=>b.page===selection.page),needle=selection.text.toLowerCase().slice(0,120);let center=local.findIndex(b=>b.text.toLowerCase().includes(needle));
 const candidates=center>=0?local.slice(Math.max(0,center-1),center+3):local;let size=0;return candidates.filter(b=>{if(size+b.text.length>6000)return false;size+=b.text.length;return true;});
}
function sourceText(bs){return bs.map(b=>`[${b.id} · 第${b.page}页]\n${b.text}`).join('\n\n');}
function jsonResponse(response,allowText=false){if(response.status<200||response.status>=300)throw new Error(({401:'密钥无效，请检查 MiniMax 配置。',403:'当前密钥没有模型权限。',429:'请求受限或额度不足，请稍后重试。'})[response.status]||`MiniMax 请求失败（HTTP ${response.status}）。`);const data=response.json;if(data?.base_resp?.status_code)throw new Error('MiniMax 未接受请求，请检查账户权限。');const c=data?.choices?.[0];if(c?.finish_reason==='length')throw new Error('模型输出被截断，请重试或缩小处理范围。');let text=c?.message?.content;if(typeof text!=='string'||text.length>150000)throw new Error('模型返回为空或超出限制。');text=text.trim();if(/^```(?:json)?\s/i.test(text))text=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');text=text.replace(/<think>[\s\S]*?<\/think>/g,'').trim();try{return JSON.parse(text);}catch{const fenced=text.match(/```json\s*([\s\S]*?)```/i);if(fenced){try{return JSON.parse(fenced[1]);}catch{}}if(allowText&&text&&!/^[{[]/.test(text))return {answer:text,refs:[]};throw new Error('模型未返回完整格式，本次结果没有保存，请重试。');}}
function citationsMarkdown(ids,paper){return [...new Set(ids.map(id=>blocks(paper).find(b=>b.id===id)?.page).filter(Boolean))].map(page=>`[[${paper.pdfPath}#page=${page}|第 ${page} 页]]`).join('、');}
function summaryMarkdown(paper){const s=paper.summary;if(!s)return'';let out=`# ${md(s.titleZh||paper.title)}\n\n${md(s.overview)}\n\n依据：${citationsMarkdown(s.overviewRefs,paper)}\n`;for(const [key,title]of [['problem','研究问题'],['method','核心方法'],['findings','主要结果'],['limitations','局限与待验证']])out+=`\n## ${title}\n\n`+(s[key].length?s[key].map(x=>`- ${md(x.text)}（${citationsMarkdown(x.refs,paper)}）`).join('\n'):'原文未提取出明确条目。')+'\n';return out;}
module.exports={ID,ROOT,MODEL,PDF_MAX_MB,PDF_MAX_BYTES,line,md,arxivId,paragraphsFromItems,blocks,summary,translation,answer,contextFor,sourceText,chatContext,jsonResponse,summaryMarkdown};
