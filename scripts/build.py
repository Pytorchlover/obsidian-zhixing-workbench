from pathlib import Path
import json,shutil,zipfile
root=Path(__file__).resolve().parents[1]
source=root/'src'
def bundle(name,stack=()):
    if name in stack: raise RuntimeError('Circular local module: '+name)
    import re
    text=(source/name).read_text()
    def replace(match):
        child=match.group(1)+'.js'
        return '(()=>{const module={exports:{}};\n'+bundle(child,stack+(name,))+'\nreturn module.exports;})()'
    return re.sub(r"require\('\./([a-z-]+)'\)",replace,text)
out=root/'dist';out.mkdir(exist_ok=True)
(out/'main.js').write_text(bundle('main.js'))
shutil.copy2(source/'styles.css',out/'styles.css')
shutil.copy2(root/'manifest.json',out/'manifest.json')
shutil.copy2(root/'scripts/pdf-layout-worker.py',out/'pdf-layout-worker.py')
with zipfile.ZipFile(out/'zhixing-research-desk.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for name in ['main.js','styles.css','manifest.json','pdf-layout-worker.py']:
        archive.write(out/name,'zhixing-research-desk/'+name)
print('Built dist/zhixing-research-desk.zip')
