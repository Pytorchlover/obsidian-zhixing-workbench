"""Install an explicitly selected built plugin; never copy notes or credentials."""
from pathlib import Path
import argparse,shutil,subprocess,sys
parser=argparse.ArgumentParser();parser.add_argument('--vault',required=True);parser.add_argument('--force',action='store_true');args=parser.parse_args()
root=Path(__file__).resolve().parents[1];vault=Path(args.vault).expanduser().resolve()
if not vault.is_dir():raise SystemExit('Vault directory does not exist')
target=vault/'.obsidian/plugins/zhixing-research-desk'
if target.exists() and not args.force:raise SystemExit('Plugin exists; back it up before using --force')
subprocess.run([sys.executable,str(root/'scripts/build.py')],check=True)
target.mkdir(parents=True,exist_ok=True)
for name in ['main.js','styles.css','manifest.json','pdf-layout-worker.py']:shutil.copy2(root/'dist'/name,target/name)
print('Installed. Enable the plugin in Obsidian Community plugins.')
