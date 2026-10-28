from pathlib import Path
import json,shutil,zipfile
root=Path(__file__).resolve().parents[1]
source=root/'src'
out=root/'dist';out.mkdir(exist_ok=True)
import subprocess
subprocess.run(['node','scripts/build.mjs'],cwd=root,check=True)
# Embed KaTeX WOFF2 fonts: formulas work offline without remote styles or font requests.
import re,base64
katex=root/'node_modules/katex/dist'
css=(katex/'katex.min.css').read_text()
def font_src(match):
    font=katex/match.group(1)
    return 'src:url(data:font/woff2;base64,'+base64.b64encode(font.read_bytes()).decode()+') format("woff2")'
css=re.sub(r'src:url\((fonts/[^)]+\.woff2)\)[^;}]*(?=[;}])',font_src,css)
(out/'styles.css').write_text(css+'\n'+(source/'styles.css').read_text())
shutil.copy2(root/'manifest.json',out/'manifest.json')
shutil.copy2(root/'scripts/pdf-layout-worker.py',out/'pdf-layout-worker.py')
with zipfile.ZipFile(out/'zhixing-research-desk.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for name in ['main.js','styles.css','manifest.json','pdf-layout-worker.py','THIRD_PARTY_LICENSES.txt']:
        archive.write(out/name,'zhixing-research-desk/'+name)
print('Built dist/zhixing-research-desk.zip')
