# -*- coding: utf-8 -*-
"""Read-only Zotero snapshot -> local workbench archive. Dry run by default.
Requires PyMuPDF (pip install pymupdf). No network or model calls.
"""
import argparse, datetime, hashlib, json, re, shutil, sqlite3
from pathlib import Path
import pymupdf

ROOT = Path('projects/个人工作台/论文库')
def digest(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024), b''): h.update(block)
    return h.hexdigest()
def classify(title, collections):
    s=title.lower()
    if re.search(r'hand.*(recon|motion|forecast)|dyn-hamr|hawor',s): return 'Ego 手部重建'
    if re.search(r'governance|curation|data quality|data processing',s): return '数据处理与治理'
    if re.search(r'umi|collection|egokit|forceband',s): return '数据采集'
    if re.search(r'ego|human.*(data|video)|everyday human',s): return 'Ego 人类数据'
    if re.search(r'vla|foundation model|robotmanip|robomanip|foundation to application',s): return 'VLA'
    return '机器人工程'
def attachment_path(root,key,value):
    if value.startswith('storage:'): return root/'storage'/key/value[8:]
    if value.startswith('attachments:'): return None  # Zotero linked-base path requires explicit resolution.
    p=Path(value);return p if p.is_absolute() else None

def migrate(zotero,vault,backup,apply=False):
    zotero,vault,backup=map(lambda x:Path(x).expanduser().resolve(),(zotero,vault,backup))
    if not vault.is_dir(): raise ValueError('Vault does not exist')
    backup.mkdir(parents=True,exist_ok=True)
    snapshot=backup/'zotero.sqlite'
    if snapshot.exists(): raise ValueError('Use a fresh backup directory for each run')
    source=sqlite3.connect((zotero/'zotero.sqlite').as_uri()+'?mode=ro',uri=True)
    with sqlite3.connect(snapshot) as dest: source.backup(dest)
    source.close();db=sqlite3.connect(snapshot);db.row_factory=sqlite3.Row
    deleted={r[0] for r in db.execute('select itemID from deletedItems')}
    items={r['itemID']:dict(r) for r in db.execute('select i.*,t.typeName from items i join itemTypes t using(itemTypeID)') if r['itemID'] not in deleted}
    fields={}
    for row in db.execute('select itemID,fieldName,value from itemData join fields using(fieldID) join itemDataValues using(valueID)'): fields.setdefault(row[0],{})[row[1]]=row[2]
    collections={r['collectionID']:dict(r) for r in db.execute('select * from collections')}
    def collection_name(cid):
        out=[];seen=set()
        while cid in collections and cid not in seen:
            seen.add(cid);r=collections[cid];out.insert(0,r['collectionName']);cid=r['parentCollectionID']
        return '/'.join(out)
    membership={}
    for cid,iid in db.execute('select collectionID,itemID from collectionItems'): membership.setdefault(iid,[]).append(collection_name(cid))
    tags={}
    for iid,tag in db.execute('select itemID,name from itemTags join tags using(tagID)'): tags.setdefault(iid,[]).append(tag)
    attachments=[];missing=[]
    for r in db.execute("select * from itemAttachments where contentType='application/pdf'"):
        if r['itemID'] not in items: continue
        a=dict(r);a['key']=items[r['itemID']]['key'];a['file']=attachment_path(zotero,a['key'],a['path']);a['title']=fields.get(r['itemID'],{}).get('title','')
        if not a['file'] or not a['file'].is_file(): missing.append(a['key']);continue
        a['hash']=digest(a['file']);a['translated']=bool(re.search(r'(?:\.compare|\.dual|\.mono|\.zh|中文|对照|翻译)',a['file'].name,re.I));attachments.append(a)
    groups={}
    for a in attachments:
        parent=a['parentItemID']
        if parent is not None:
            if parent in items and items[parent]['typeName'] in ('preprint','journalArticle','conferencePaper'): groups.setdefault(str(parent),[]).append(a)
        else:
            stem=re.sub(r'\.(?:compare|dual|mono|zh)(?=\.|$)','',a['file'].stem,flags=re.I)
            if re.search('clean.code|代码整洁',stem,re.I): continue
            groups.setdefault('standalone:'+stem,[]).append(a)
    report={'version':1,'created':datetime.datetime.now().isoformat(),'mode':'applied' if apply else 'dry-run','items':[],'missingAttachments':missing,'skippedNonPaperAttachments':len(attachments)-sum(map(len,groups.values()))}
    existing={}
    for f in (vault/ROOT).glob('*/paper.json'):
        p=json.loads(f.read_text());existing[p['id']]=(f,p)
    for gid,aa in groups.items():
        originals=[a for a in aa if not a['translated']]
        if not originals: report['items'].append({'group':gid,'error':'No original PDF; kept in Zotero'});continue
        primary=originals[0];iid=primary['parentItemID'];meta=fields.get(iid,{});title=meta.get('title') or primary['title'] or primary['file'].stem
        doc=pymupdf.open(primary['file']);pid=primary['hash'][:24];old=existing.get(pid)
        # The same arXiv PDF may have different metadata bytes in Zotero. Keep its separate original; never replace an existing record by title alone.
        if not old:
            # PDF generators change metadata bytes. Merge only when page count and first-page vocabulary agree almost exactly.
            tokens=lambda text:set(re.findall(r'[a-z0-9]+',text.lower()))
            incoming=tokens(doc[0].get_text())
            matches=[]
            for eid,(efile,ep) in existing.items():
                if len(ep['pages'])!=len(doc):continue
                known=tokens(' '.join(ep['pages'][0]['paragraphs']))
                normalize=lambda text:re.sub(r'[^a-z0-9]','',text.lower())
                title_match=len(normalize(ep['title']))>40 and normalize(ep['title']) in normalize(doc[0].get_text())
                if title_match or (len(incoming)>50 and len(incoming&known)/max(1,len(incoming|known))>0.95):matches.append(eid)
            if len(matches)==1:pid=matches[0];old=existing[pid]
        category=classify(title,membership.get(iid,[]));folder=vault/ROOT/pid
        paper=old[1] if old else {'version':1,'id':pid,'title':title,'authors':'','source':meta.get('url',''),'pdfPath':f'raw/assets/papers/{pid}.pdf','created':str(datetime.date.today()),'updated':str(datetime.date.today()),'status':'unread','pages':[{'paragraphs':[b[4].strip() for b in page.get_text('blocks',sort=True) if len(b)>4 and isinstance(b[4],str) and b[4].strip()]} for page in doc],'summary':None,'translations':{},'chat':[],'noteDraft':'','readDays':[]}
        if not old:
            paper['chars']=sum(len(s) for page in paper['pages'] for s in page['paragraphs'])
            if iid:
                paper['authors']=', '.join(' '.join(x for x in [r['firstName'],r['lastName']] if x) for r in db.execute('select c.* from itemCreators ic join creators c using(creatorID) where ic.itemID=? order by orderIndex',(iid,)))
        paper.setdefault('category',category)
        provenance=paper.setdefault('zotero',{});provenance.update({'itemKey':items[iid]['key'] if iid else primary['key'],'collections':membership.get(iid,[]),'tags':tags.get(iid,[]),'fields':meta,'attachments':[]})
        variants={};duplicates=0
        for a in aa:
            if a['hash'] in variants:
                duplicates+=1;variants[a['hash']]['keys'].append(a['key']);continue
            path=paper['pdfPath'] if a is primary and a['hash'][:24]==pid else str(ROOT/pid/'pdf'/('zotero-'+a['hash'][:24]+'.pdf'))
            variant={'keys':[a['key']],'sha256':a['hash'],'path':path,'name':a['file'].name,'translated':a['translated']}
            variants[a['hash']]=variant
            if apply:
                dest=vault/path;dest.parent.mkdir(parents=True,exist_ok=True)
                if dest.exists():
                    if digest(dest)!=a['hash']: raise ValueError('Conflicting PDF destination: '+path)
                else: shutil.copy2(a['file'],dest)
        provenance['attachments']=list(variants.values())
        dual=[];mono=[]
        for variant in variants.values():
            if not variant['translated']:continue
            with pymupdf.open(vault/variant['path'] if apply else next(a['file'] for a in aa if a['hash']==variant['sha256'])) as translated:
                ratio=translated[0].rect.width/doc[0].rect.width
                if len(translated)==len(doc) and ratio>1.7:dual.append(variant)
                elif len(translated)==len(doc) and ratio<1.3:mono.append(variant)
                else: variant['role']='unclassified'
        if dual or mono:
            layout=paper.setdefault('layoutPdf',{'engine':'Zotero migration','created':datetime.datetime.now().isoformat(),'pageCount':len(doc),'mode':'side-by-side'})
            if dual:layout.setdefault('dualPath',dual[-1]['path'])
            if mono:layout.setdefault('monoPath',mono[-1]['path'])
        notes=[dict(r) for r in db.execute('select * from itemNotes where parentItemID=?',(iid,)) if r['itemID'] not in deleted] if iid else []
        aids={a['itemID'] for a in aa};annotations=[dict(r) for r in db.execute('select * from itemAnnotations') if r['parentItemID'] in aids and r['itemID'] not in deleted]
        provenance['notes']=notes;provenance['annotations']=annotations
        if apply:
            folder.mkdir(parents=True,exist_ok=True)
            target=folder/'paper.json'
            if target.exists():
                b=backup/'records'/pid/'paper.json';b.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,b)
            temp=folder/'paper.json.tmp';temp.write_text(json.dumps(paper,ensure_ascii=False,indent=2));temp.replace(target)
            info=folder/'Zotero资料.md'
            if not info.exists():
                front='---\nstatus: active\ntype: paper\ntags: [paper, zotero]\ncreated: '+str(datetime.date.today())+'\nupdated: '+str(datetime.date.today())+'\nsources: ['+json.dumps('zotero://select/library/items/'+provenance['itemKey'])+']\n---\n\n'
                links='\n'.join('- [['+v['path']+'|'+('译文' if v['translated'] else '原文')+' · '+v['name'].replace('|',' ')+']]' for v in variants.values())
                note_text='\n\n'.join(re.sub('<[^>]+>','',n['note']) for n in notes)
                quote_text='\n\n'.join('> '+(a['text'] or '').replace('\n','\n> ')+'\n\n'+(a['comment'] or '') for a in annotations)
                info.write_text(front+'# '+title+'\n\n分类：'+paper['category']+'\n\nZotero 目录：'+', '.join(provenance['collections'])+'\n\n'+links+'\n\n## Zotero 笔记\n\n'+note_text+'\n\n## Zotero 批注\n\n'+quote_text+'\n')
        report['items'].append({'id':pid,'title':title,'category':paper['category'],'pages':len(doc),'attachments':len(aa),'uniquePdfs':len(variants),'duplicateAttachments':duplicates,'bilingual':len(dual),'chinese':len(mono),'notes':len(notes),'annotations':len(annotations),'existing':bool(old)})
        existing[pid]=(folder/'paper.json',paper)
        doc.close()
    report['summary']={'papers':sum('id'in r for r in report['items']),'pdfs':sum(r.get('uniquePdfs',0) for r in report['items']),'duplicates':sum(r.get('duplicateAttachments',0) for r in report['items']),'bilingual':sum(r.get('bilingual',0) for r in report['items']),'notes':sum(r.get('notes',0) for r in report['items']),'annotations':sum(r.get('annotations',0) for r in report['items']),'missing':len(missing)}
    (backup/'migration-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    if apply:
        target=vault/'projects/个人工作台/Zotero迁移报告.json'
        if target.exists():shutil.copy2(target,backup/'previous-migration-report.json')
        target.write_text(json.dumps(report,ensure_ascii=False,indent=2))
    return report
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--zotero',required=True);p.add_argument('--vault',required=True);p.add_argument('--backup',required=True);p.add_argument('--apply',action='store_true');args=p.parse_args();print(json.dumps(migrate(args.zotero,args.vault,args.backup,args.apply)['summary']))
