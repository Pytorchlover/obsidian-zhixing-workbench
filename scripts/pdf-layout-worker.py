"""PDF2zh Next adapter: JSON stdin, safe JSON progress stdout, no key files."""
import asyncio,json,sys,logging,os
from pathlib import Path
logging.disable(logging.CRITICAL)

def emit(value):
 print('ZDPDF:'+json.dumps(value,ensure_ascii=False),flush=True)

async def main():
 request=json.loads(sys.stdin.readline())
 # Import after reading credentials; never place them in argv, env, or config files.
 from pdf2zh_next.config.model import SettingsModel
 from pdf2zh_next.high_level import do_translate_async_stream
 settings=SettingsModel.model_validate({
  'report_interval':0.5,
  'translation':{'lang_in':'en','lang_out':'zh','output':request['output'],'qps':2,'pool_max_workers':4,'no_auto_extract_glossary':True},
  'pdf':{'pages':request.get('pages'),'watermark_output_mode':'no_watermark','translate_table_text':False,'use_alternating_pages_dual':False},
  'translate_engine_settings':{'translate_engine_type':'OpenAI','openai_model':'MiniMax-M3.1-Flash','openai_base_url':'https://api.minimax.cn/v1','openai_api_key':request.pop('key'),'openai_timeout':'120','openai_reasoning_effort':'low','openai_send_reasoning_effort':True,'openai_send_temprature':False,'openai_enable_json_mode':False}})
 done=False
 async for event in do_translate_async_stream(settings,request['input']):
  kind=event['type']
  if kind.startswith('progress_'):
   emit({'type':'progress','stage':event.get('stage',''),'percent':round(event.get('overall_progress',0),1)})
  elif kind=='error':
   # The UI receives no upstream traces, API responses, or credentials.
   raise RuntimeError('PDF translation failed')
  elif kind=='finish':
   result=event['translate_result']
   import pymupdf
   mono=str(result.mono_pdf_path);dual=str(result.dual_pdf_path)
   with pymupdf.open(request['input']) as source:source_pages=source.page_count
   counts=[]
   for path in [mono,dual]:
    with pymupdf.open(path) as doc:
     if doc.page_count!=source_pages:raise RuntimeError('Page count mismatch')
     counts.append(doc.page_count)
   with pymupdf.open(mono) as doc:
    # Reject an unchanged English PDF falsely reported as translated.
    translated_text=''.join(page.get_text() for page in list(doc)[:min(3,len(doc))])
    if sum('\u4e00'<=ch<='\u9fff' for ch in translated_text)<20:raise RuntimeError('Missing Chinese translation')
   emit({'type':'finish','mono':mono,'dual':dual,'engine':'pdf2zh-next','version':'2.9.0','sourcePages':source_pages,'monoPages':counts[0],'dualPages':counts[1]})
   done=True
   break
 if not done:raise RuntimeError('Missing output')

if __name__=='__main__':
 try:asyncio.run(main())
 except Exception as e:
  # Keep diagnostics to exception class only; no model payload or key can leak.
  import traceback
  emit({'type':'error','kind':type(e).__name__,'where':[f'{Path(f.filename).name}:{f.lineno}:{f.name}' for f in traceback.extract_tb(e.__traceback__)[-6:]]})
  sys.exit(1)
