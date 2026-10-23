import React, {createContext,useContext,useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {AssistantRuntimeProvider,useLocalRuntime,ExportedMessageRepository,ThreadPrimitive,MessagePrimitive,ComposerPrimitive,ActionBarPrimitive,BranchPickerPrimitive,useAuiState} from '@assistant-ui/react';
import {MarkdownTextPrimitive} from '@assistant-ui/react-markdown';
const {createStore}=require('./paper-threads');
const {modelAdapter,captureContext}=require('./paper-chat-adapter');
const {blocks}=require('./paper-core');
const ChatContext=createContext<any>(null);
const useChat=()=>useContext(ChatContext);
function Text(){
 const {preview}=useChat();
 const refs=useAuiState(s=>s.message.metadata.custom.refs) as string[]|undefined;
 const valid=useMemo(()=>new Set(refs||[]),[refs]);
 return <MarkdownTextPrimitive preprocess={text=>text.replace(/\[(p[0-9]+s[0-9]+)\]/g,(match,id)=>valid.has(id)?`[${match}](#zd-ref-${id})`:match)} components={{a:({href,children})=>href?.startsWith('#zd-ref-')?<button className="zd-aui-citation" onClick={()=>preview([href.slice(8)])}>{children}</button>:<a href={href} target="_blank" rel="noreferrer">{children}</a>}} />;
}
function Message(){
 const {paper,preview}=useChat();
 const role=useAuiState(s=>s.message.role),status=useAuiState(s=>s.message.status),custom=useAuiState(s=>s.message.metadata.custom) as any;
 const refs=(custom?.refs||[]).filter((id:string)=>blocks(paper).some((b:any)=>b.id===id));
 return <MessagePrimitive.Root className={'zd-aui-message '+role}>
  <div className="zd-aui-role">{role==='user'?'我':'论文助手'}</div>
  {role==='user'&&custom?.selection&&<blockquote className="zd-aui-quote">第 {custom.selection.page} 页 · {custom.selection.text}</blockquote>}
  <div className="zd-aui-markdown"><MessagePrimitive.Parts components={{Text}} /></div>
  {status?.type==='running'&&<span className="zd-aui-generating" role="status">正在回答…</span>}
  {refs.length>0&&<button className="zd-aui-evidence" onClick={()=>preview(refs)}>查看原文依据 · {new Set(refs.map((id:string)=>id.match(/^p([0-9]+)/)?.[1])).size} 页 ↗</button>}
  {custom?.insufficient&&<p className="zd-aui-hint">未附有效引用，请结合论文核对。</p>}
  {status?.type==='incomplete'&&<p className="zd-aui-error" role="status">{status.reason==='cancelled'?'已停止，已生成的内容会保留。':custom?.error||'回答未完成，可以重试。'}</p>}
  {role==='assistant'&&<ActionBarPrimitive.Root className="zd-aui-actions"><ActionBarPrimitive.Copy title="复制回答">复制</ActionBarPrimitive.Copy><ActionBarPrimitive.Reload title="重新生成回答">重试</ActionBarPrimitive.Reload><BranchPickerPrimitive.Root className="zd-aui-branches" hideWhenSingleBranch><BranchPickerPrimitive.Previous aria-label="上一版回答">‹</BranchPickerPrimitive.Previous><BranchPickerPrimitive.Number/> / <BranchPickerPrimitive.Count/><BranchPickerPrimitive.Next aria-label="下一版回答">›</BranchPickerPrimitive.Next></BranchPickerPrimitive.Root></ActionBarPrimitive.Root>}
 </MessagePrimitive.Root>;
}
function Conversation({thread,store,bridge,refresh}:any){
 const [saveError,setSaveError]=useState('');
 const context:any=useSyncExternalStore(bridge.subscribe,bridge.snapshot);
 const adapter=useMemo(()=>modelAdapter({svc:bridge.svc,paper:bridge.paper,context:bridge.context,onBusy:bridge.busy,onSubmitted:bridge.consumeSelection,initial:thread.repository.messages}),[bridge]);
 const history=useMemo(()=>({scopeId:bridge.paper.id+'/'+thread.id,
  load:async()=>{const t=await store.get(thread.id);return ExportedMessageRepository.fromBranchableArray(t.repository.messages.map((item:any)=>({...item,message:{...item.message,createdAt:new Date(item.message.createdAt)}})),{headId:t.repository.headId});},
  append:async(item:any)=>{try{await store.append(thread.id,item);setSaveError('');refresh();}catch(e:any){setSaveError('对话未保存：'+e.message);throw e;}},
  update:async(item:any)=>{try{await store.append(thread.id,item);setSaveError('');}catch(e:any){setSaveError('对话未保存：'+e.message);throw e;}}
 }),[thread.id,store,bridge,refresh]);
 const runtime=useLocalRuntime(adapter,{adapters:{history}});
 const running=useSyncExternalStore(runtime.thread.subscribe,()=>runtime.thread.getState().isRunning);
 // Obsidian owns PDF selection; React subscribes to this external bridge.
 // The keyed component owns one paper/thread, so pending writes cannot change another session.
 useEffect(()=>{
  const composer=runtime.thread.composer;
  composer.setText(thread.draft||'');
  bridge.runtime=runtime;
  const unregister=runtime.registerModelContextProvider({getModelContext:()=>({unstable_composerMetadata:captureContext(bridge.context)})});
  let previous=composer.getState().text,head:string|null|undefined;
  const unsubscribe=composer.subscribe(()=>{const text=composer.getState().text;if(text===previous)return;previous=text;bridge.queue(()=>store.draft(thread.id,text)).catch((e:any)=>setSaveError('草稿未保存：'+e.message));});
  const stop=runtime.thread.subscribe(()=>{const state=runtime.thread.getState();if(!state.isLoading&&!state.isRunning){const id=state.messages.at(-1)?.id||null;if(head!==id){head=id;bridge.queue(()=>store.head(thread.id,id)).catch((e:any)=>setSaveError('会话未保存：'+e.message));}}});
  return()=>{unregister();unsubscribe();stop();runtime.thread.cancelRun();if(bridge.runtime===runtime)bridge.runtime=null;};
 },[runtime,thread.id,bridge,store]);
 return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root className="zd-aui-thread">
  <ThreadPrimitive.Viewport className="zd-aui-viewport" autoScroll aria-label="论文对话记录">
   <ThreadPrimitive.Empty><div className="zd-aui-empty"><span>✦</span><h3>从一个问题开始</h3><p>选中文字解释、翻译，或围绕整篇论文提问。</p><button onClick={()=>bridge.send('这篇论文最重要的贡献是什么？请结合原文解释。')}>这篇论文解决了什么问题？ ↗</button></div></ThreadPrimitive.Empty>
   <ThreadPrimitive.Messages components={{UserMessage:Message,AssistantMessage:Message}} />
  </ThreadPrimitive.Viewport>
  <ComposerPrimitive.Root className="zd-aui-composer">
   {context.selection&&<div className="zd-aui-selection"><div>已引用 · 第 {context.selection.page} 页<button type="button" aria-label="取消引用" onClick={()=>bridge.setSelection(null)}>×</button></div><blockquote>{context.selection.text}</blockquote></div>}
   <label className="zd-aui-scope">回答范围 <select aria-label="回答范围" value={context.scope} disabled={running} onChange={e=>bridge.setScope(e.target.value)}><option value="paper">整篇论文</option><option value="selection" disabled={!context.selection}>选区与附近段落</option></select></label>
   <ComposerPrimitive.Input className="zd-paper-question" aria-label="论文问题" placeholder="想了解这一段，还是整篇论文？" maxLength={4000} submitMode="ctrlEnter" rows={2} autoFocus={false}/>
   {(saveError||bridge.notice)&&<p className="zd-aui-error" role="alert">{saveError||bridge.notice}</p>}
   <div className="zd-aui-composer-foot"><span>⌘ / Ctrl + Enter</span>{running?<ComposerPrimitive.Cancel className="zd-primary">停止回答 ■</ComposerPrimitive.Cancel>:<ComposerPrimitive.Send className="zd-primary">发送 ↑</ComposerPrimitive.Send>}</div>
  </ComposerPrimitive.Root>
 </ThreadPrimitive.Root></AssistantRuntimeProvider>;
}
function Chat({store,bridge,initial}:any){
 const [state,setState]=useState(initial),[active,setActive]=useState(initial.activeId),[pending,setPending]=useState(false),[error,setError]=useState('');
 const refresh=React.useCallback(()=>{store.list().then(setState).catch((e:any)=>setError(e.message));},[store]);
 const thread=state.threads.find((t:any)=>t.id===active)||state.threads[0];
 const change=async(id?:string)=>{if(bridge.isBusy||pending)return;setPending(true);try{await bridge.flush();const next=id||await store.create();await store.activate(next);const updated=await store.list();bridge.setSelection(null);setState(updated);setActive(next);setError('');}catch(e:any){setError(e.message);}finally{setPending(false);}};
 const context:any=useSyncExternalStore(bridge.subscribe,bridge.snapshot);
 return <ChatContext.Provider value={bridge}><header className="zd-paper-chat-heading"><div><h2>与论文对话</h2><span className="zd-aui-local">仅当前论文 · 本地保存</span></div><button className="zd-aui-new" disabled={context.busy||pending} onClick={()=>change()} title="新建会话" aria-label="新建会话">＋</button></header>
  <div className="zd-aui-sessions"><select value={active} aria-label="切换论文会话" disabled={context.busy||pending} onChange={e=>change(e.target.value)}>{state.threads.map((t:any)=><option key={t.id} value={t.id}>{t.title}</option>)}</select><button disabled={context.busy||pending} title="重命名会话" aria-label="重命名会话" onClick={()=>bridge.rename(thread,async(title:string)=>{await store.rename(active,title);refresh();})}>✎</button><span>{state.threads.length} 个会话</span></div>
  {error&&<p role="alert" className="zd-aui-error">{error}</p>}
  <Conversation key={bridge.paper.id+'/'+thread.id} thread={thread} store={store} bridge={bridge} refresh={refresh}/>
 </ChatContext.Provider>;
}
export function mountPaperChat(host:HTMLElement,options:any){
 const root=createRoot(host),listeners=new Set<()=>void>();let snapshot:any={selection:options.selection||null,scope:options.selection?'selection':'paper',busy:false},serial=Promise.resolve();
 const emit=()=>{snapshot={...snapshot};listeners.forEach(fn=>fn());};
 const bridge:any={...options,context:{selection:snapshot.selection,scope:snapshot.scope,page:options.page,selectionRevision:0},runtime:null,isBusy:false,notice:'',
  snapshot:()=>snapshot,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn);},
  queue:(fn:any)=>{serial=serial.catch(()=>{}).then(fn);return serial;},flush:()=>serial,
  setSelection:(value:any)=>{bridge.context.selectionRevision++;snapshot.selection=value?{text:value.text,page:value.page,mode:value.mode}:null;snapshot.scope=value?'selection':'paper';bridge.context.selection=snapshot.selection;bridge.context.scope=snapshot.scope;options.onSelectionChange?.(snapshot.selection);emit();},
  consumeSelection:(sent:any)=>{if(sent.selectionRevision===bridge.context.selectionRevision)bridge.setSelection(null);},
  setScope:(scope:string)=>{snapshot.scope=scope;bridge.context.scope=scope;emit();},
  busy:(value:boolean)=>{if(disposed)return;bridge.isBusy=value;snapshot.busy=value;options.onBusy(value);emit();},
  cancel:()=>bridge.runtime?.thread.cancelRun(),
  focus:()=>host.querySelector<HTMLTextAreaElement>('textarea')?.focus(),
  send:(text:string)=>{if(!bridge.runtime||bridge.isBusy)return;bridge.runtime.thread.composer.setText(text);bridge.runtime.thread.composer.send();},
 };
 const store=createStore(options.svc,options.paper.id);
 let disposed=false;
 store.init().then((initial:any)=>{if(!disposed)root.render(<Chat store={store} bridge={bridge} initial={initial}/>);}).catch((e:any)=>{if(!disposed)root.render(<p role="alert" className="zd-aui-error">无法读取本地会话：{e.message}</p>);});
 return {setSelection:bridge.setSelection,send:bridge.send,focus:bridge.focus,cancel:bridge.cancel,flush:bridge.flush,dispose:()=>{disposed=true;root.unmount();listeners.clear();if(bridge.isBusy)options.onBusy(false);}};
}
