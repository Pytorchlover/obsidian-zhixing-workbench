from pathlib import Path
import json,shutil,zipfile
root=Path(__file__).resolve().parents[1]
source=root/'src'
out=root/'dist';out.mkdir(exist_ok=True)
import subprocess
subprocess.run(['node','scripts/build.mjs'],cwd=root,check=True)
shutil.copy2(source/'styles.css',out/'styles.css')
shutil.copy2(root/'manifest.json',out/'manifest.json')
shutil.copy2(root/'scripts/pdf-layout-worker.py',out/'pdf-layout-worker.py')
with zipfile.ZipFile(out/'zhixing-research-desk.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for name in ['main.js','styles.css','manifest.json','pdf-layout-worker.py','THIRD_PARTY_LICENSES.txt']:
        archive.write(out/name,'zhixing-research-desk/'+name)
print('Built dist/zhixing-research-desk.zip')
