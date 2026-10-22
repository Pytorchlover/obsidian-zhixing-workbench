"""Check the export and built artifacts without printing matched secret values."""
from pathlib import Path
import re,zipfile
root=Path(__file__).resolve().parents[1]
patterns=[re.compile(rb'sk-[A-Za-z0-9_-]{20,}'),re.compile(rb'gh[pousr]_[A-Za-z0-9]{20,}'),re.compile(rb'github_pat_[A-Za-z0-9_]{20,}'),re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),re.compile(rb'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}')]
forbidden={'local.enc','paper.json','data.json','.env'}
failures=[];count=0
def check(name,data):
 global count
 count+=1
 if any(pattern.search(data) for pattern in patterns):failures.append((name,'credential-like content'))
 if b'/'+b'Users/' in data or b'/'+b'home/'+b'jikangyi' in data:failures.append((name,'personal absolute path'))
for path in root.rglob('*'):
 if not path.is_file() or any(x in {'.git','node_modules','__pycache__'} for x in path.relative_to(root).parts):continue
 name=str(path.relative_to(root))
 if path.name in forbidden or path.suffix in {'.enc','.pem','.key'}:failures.append((name,'private runtime file'))
 if path.suffix=='.zip':
  with zipfile.ZipFile(path) as archive:
   for member in archive.namelist():check(name+'!'+member,archive.read(member))
 elif path.suffix not in {'.png','.jpg','.jpeg','.webp','.gif'}:check(name,path.read_bytes())
if failures:
 for name,reason in failures:print('FAIL:',name,reason)
 raise SystemExit(1)
print(f'PASS: {count} source/artifact entries; no credential patterns or private runtime files')
