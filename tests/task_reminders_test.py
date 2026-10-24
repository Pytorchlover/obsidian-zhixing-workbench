import datetime as dt
import importlib.util
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import json
from pathlib import Path
spec=importlib.util.spec_from_file_location('reminders',Path(__file__).parents[1]/'scripts/task-reminders.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Reminders(unittest.TestCase):
 def test_parser(self):
  with tempfile.TemporaryDirectory() as root:
   vault=Path(root);p=vault/'projects/demo.md';p.parent.mkdir();p.write_text('- [ ] date 📅 2026-10-24\n- [x] done 📅 2026-10-24\n```md\n- [ ] example 📅 2026-10-24\n```\n- [ ] timed 📅 2026-10-24 15:30\n- [ ] invalid 📅 2026-02-30\n');tasks=m.read_tasks(vault);self.assertEqual(len(tasks),2);self.assertEqual(tasks[1]['deadline'].hour,15);before=tasks[0]['id'];p.write_text('\n'+p.read_text());self.assertEqual(m.read_tasks(vault)[0]['id'],before)
 def test_schedule(self):
  task=dict(id='a',path='projects/a.md',text='example',line=1,today=False,due='2026-10-24',deadline=dt.datetime(2026,10,24,15,30,tzinfo=m.TZ));state={'sent':{}};now=dt.datetime(2026,10,24,14,40,tzinfo=m.TZ)
  result=m.plans([task],now,state);self.assertEqual([x[0] for x in result],['morning:2026-10-24','deadline:a']);state['sent']={x[0]:True for x in result};self.assertEqual(m.plans([task],now,state),[])
  self.assertEqual([x[0] for x in m.plans([task],now.replace(hour=18),{'sent':{}})],['evening:2026-10-24']);self.assertEqual(m.plans([],now,{'sent':{}}),[])
 def test_no_date_not_arbitrary_deadline(self):
  task=dict(id='a',path='projects/a.md',text='example #today',line=1,today=True,due='',deadline=None);now=dt.datetime(2026,10,24,18,tzinfo=m.TZ);self.assertEqual(m.plans([task],now,{'sent':{}}),[])
 def test_delivery_commit_and_dedup(self):
  with tempfile.TemporaryDirectory() as root:
   v=Path(root);(v/'wiki').mkdir();(v/'wiki/index.md').write_text('# index');(v/'projects').mkdir();(v/'projects/task.md').write_text('- [ ] example 📅 2026-10-24')
   cfg={'vault':root,'cli':'fake-cli','profile':'fixture','recipient':'ou_fixture','path':'/bin'};state=v/'state.json';now=dt.datetime(2026,10,24,9,tzinfo=m.TZ)
   with patch.object(m.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=json.dumps({'ok':True,'data':{'message_id':'test'}}),stderr='')) as send:
    self.assertEqual(m.run(cfg,state,now)['sent'],1);self.assertEqual(m.run(cfg,state,now)['sent'],0);self.assertEqual(send.call_count,1)
 def test_failed_delivery_is_not_marked_sent(self):
  with tempfile.TemporaryDirectory() as root:
   v=Path(root);(v/'wiki').mkdir();(v/'wiki/index.md').write_text('# index');(v/'projects').mkdir();(v/'projects/task.md').write_text('- [ ] example 📅 2026-10-24')
   cfg={'vault':root,'cli':'fake-cli','profile':'fixture','recipient':'ou_fixture','path':'/bin'};state=v/'state.json'
   with patch.object(m.subprocess,'run',return_value=SimpleNamespace(returncode=1,stdout='',stderr=json.dumps({'ok':False,'error':{'code':123}}))):
    with self.assertRaisesRegex(RuntimeError,'feishu_delivery_failed'):m.run(cfg,state,dt.datetime(2026,10,24,9,tzinfo=m.TZ))
   self.assertEqual(json.loads(state.read_text())['sent'],{})
if __name__=='__main__':unittest.main()
