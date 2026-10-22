'use strict';
const https=require('https');
const {StringDecoder}=require('string_decoder');
function sseParser(onEvent){let buffer='';return{push(chunk){buffer+=chunk;if(buffer.length>1024*1024)throw Error('模型事件超出限制。');buffer=buffer.replace(/\r\n/g,'\n');let end;while((end=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=event.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(data)onEvent(data);}},end(){if(buffer.trim())this.push('\n\n');}};}
function streamChat({key,model,messages,signal,onDelta=()=>{},request=https.request,timeout=180000}){
 return new Promise((resolve,reject)=>{let req,res,timer,settled=false,text='',finished=false,reason='';const decoder=new StringDecoder('utf8');
 const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error){error.partial=text;reject(error);req?.destroy();res?.destroy();}else resolve(text);};
 const abort=()=>{const error=Error('已停止生成');error.name='AbortError';finish(error);};
 const parser=sseParser(data=>{if(settled)return;if(data==='[DONE]'){finished=true;return;}let event;try{event=JSON.parse(data);}catch{throw Error('流式回复格式错误，请重试。');}if(event.error||event.base_resp?.status_code)throw Error('模型未接受请求，请检查权限与额度。');const choice=event.choices?.[0];if(choice?.finish_reason){reason=choice.finish_reason;finished=true;}const part=choice?.delta?.content;if(typeof part==='string'&&part){text+=part;if(text.length>40000)throw Error('回答超出长度限制。');onDelta(part,text);}});
 if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
 try{req=request('https://api.minimax.cn/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key}},response=>{res=response;if(res.statusCode<200||res.statusCode>=300){res.resume();finish(Error(({401:'密钥无效，请检查 MiniMax 配置。',403:'当前密钥没有模型权限。',429:'请求受限或额度不足，请稍后重试。'})[res.statusCode]||`模型请求失败（HTTP ${res.statusCode}）。`));return;}res.on('data',chunk=>{try{parser.push(decoder.write(chunk));}catch(e){finish(e);}});res.on('end',()=>{try{parser.push(decoder.end());parser.end();if(!finished)throw Error('连接提前结束，已保留收到的内容。');if(reason==='length')throw Error('回答达到长度上限，已保留部分内容。');if(!text.trim())throw Error('模型未返回正文，请重试。');finish();}catch(e){finish(e);}});res.on('aborted',()=>finish(Error('连接中断，已保留收到的内容。')));res.on('error',()=>finish(Error('连接中断，已保留收到的内容。')));});req.on('error',()=>finish(Error('连接模型失败，请检查网络后重试。')));timer=setTimeout(()=>finish(Error('回答超时，已保留收到的内容。')),timeout);req.end(JSON.stringify({model,stream:true,reasoning_effort:'low',max_completion_tokens:8192,messages}));}catch{finish(Error('无法建立模型连接，请重试。'));}
 });
}
module.exports={sseParser,streamChat};
