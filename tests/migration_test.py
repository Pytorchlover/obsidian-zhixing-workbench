"""Real SQLite/PDF fixture checks; no user library or network."""
import importlib.util,json,sqlite3,tempfile,unittest,hashlib
from pathlib import Path
import pymupdf
spec=importlib.util.spec_from_file_location('migration',Path(__file__).resolve().parents[1]/'scripts/migrate-zotero.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class MigrationTest(unittest.TestCase):
 def test_archive_idempotency_and_translation(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);z=root/'zotero';z.mkdir();v=root/'vault';v.mkdir();db=sqlite3.connect(z/'zotero.sqlite')
   db.executescript('''create table items(itemID integer,key text,itemTypeID integer);create table itemTypes(itemTypeID integer,typeName text);create table deletedItems(itemID integer);create table itemAttachments(itemID integer,parentItemID integer,contentType text,path text);create table itemData(itemID integer,fieldID integer,valueID integer);create table fields(fieldID integer,fieldName text);create table itemDataValues(valueID integer,value text);create table collections(collectionID integer,collectionName text,parentCollectionID integer);create table collectionItems(collectionID integer,itemID integer);create table itemTags(itemID integer,tagID integer);create table tags(tagID integer,name text);create table itemCreators(itemID integer,creatorID integer,orderIndex integer);create table creators(creatorID integer,firstName text,lastName text);create table itemNotes(itemID integer,parentItemID integer,note text);create table itemAnnotations(itemID integer,parentItemID integer,text text,comment text);insert into itemTypes values(31,'preprint'),(3,'attachment'),(28,'note'),(1,'annotation');insert into items values(1,'PAPERKEY',31),(2,'ORIGINAL',3),(3,'DUALPDF1',3),(4,'DUALPDF2',3),(5,'NOTESKEY',28),(6,'ANNOTATE',1);insert into fields values(1,'title');insert into itemDataValues values(1,'Hand Motion Reconstruction');insert into itemData values(1,1,1);insert into collections values(1,'Human',null),(2,'Ego',1);insert into collectionItems values(2,1);insert into itemNotes values(5,1,'<p>A note</p>');insert into itemAnnotations values(6,2,'An excerpt','A comment');''')
   for iid,key,name,width in [(2,'ORIGINAL','paper.pdf',600),(3,'DUALPDF1','paper.compare.pdf',1200),(4,'DUALPDF2','paper.compare.pdf',1200)]:
    folder=z/'storage'/key;folder.mkdir(parents=True);path=folder/name
    if iid==4:path.write_bytes((z/'storage/DUALPDF1'/name).read_bytes())
    else:
     doc=pymupdf.open();page=doc.new_page(width=width,height=800);page.insert_text((50,50),'A public synthetic hand reconstruction paper.');doc.save(path);doc.close()
    db.execute('insert into itemAttachments values(?,?,?,?)',(iid,1,'application/pdf','storage:'+name))
   db.commit();db.close();source_hash=m.digest(z/'zotero.sqlite')
   dry=m.migrate(z,v,root/'backup-dry');self.assertEqual(dry['summary']['papers'],1);self.assertEqual(list(v.iterdir()),[])
   report=m.migrate(z,v,root/'backup-apply',True);self.assertEqual(report['summary']['pdfs'],2);self.assertEqual(report['summary']['duplicates'],1);self.assertEqual(report['summary']['bilingual'],1)
   pid=report['items'][0]['id'];target=v/m.ROOT/pid/'paper.json';paper=json.loads(target.read_text());self.assertEqual(paper['category'],'Ego 手部重建');self.assertEqual(paper['zotero']['collections'],['Human/Ego']);self.assertEqual(len(paper['zotero']['notes']),1);self.assertEqual(len(paper['zotero']['annotations']),1);self.assertTrue((v/paper['layoutPdf']['dualPath']).exists())
   paper['chat']=[{'text':'Preserve my existing conversation'}];paper['summary']={'overview':'Preserve summary'};target.write_text(json.dumps(paper));note=v/m.ROOT/pid/'Zotero资料.md';note.write_text(note.read_text()+'\nMy own edit\n')
   m.migrate(z,v,root/'backup-repeat',True);next_p=json.loads(target.read_text());self.assertEqual(next_p['chat'],paper['chat']);self.assertEqual(next_p['summary'],paper['summary']);self.assertIn('My own edit',note.read_text());self.assertEqual(m.digest(z/'zotero.sqlite'),source_hash);self.assertTrue((root/'backup-repeat/records'/pid/'paper.json').exists())
if __name__=='__main__':unittest.main()
