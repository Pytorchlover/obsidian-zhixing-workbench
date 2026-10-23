import {build} from 'esbuild';
import {builtinModules} from 'node:module';
await build({entryPoints:['src/main.js'],outfile:'dist/main.js',bundle:true,platform:'node',format:'cjs',target:'es2022',external:['obsidian','electron',...builtinModules,...builtinModules.map(x=>'node:'+x)],define:{'process.env.NODE_ENV':'"production"'},jsx:'automatic',minify:true,legalComments:'eof',metafile:true}).then(async result=>{const {writeFile}=await import('node:fs/promises');await writeFile('dist/build-meta.json',JSON.stringify(result.metafile));});
// Ship the upstream notices for every npm package present in the actual bundle.
const {readFile,readdir,writeFile}=await import('node:fs/promises');
const {dirname,resolve,join}=await import('node:path');
const meta=JSON.parse(await readFile('dist/build-meta.json','utf8'));
const packages=new Map();
for(const input of Object.keys(meta.inputs).filter(x=>x.includes('node_modules/'))){
 let folder=dirname(resolve(input));
 while(folder.includes('node_modules')){
  try{const pkg=JSON.parse(await readFile(join(folder,'package.json'),'utf8'));if(pkg.name){packages.set(folder,pkg);break;}}catch{}
  const parent=dirname(folder);if(parent===folder)break;folder=parent;
 }
}
let notices='Bundled npm dependency notices\n\n';
for(const [folder,pkg] of [...packages].sort((a,b)=>a[1].name.localeCompare(b[1].name))){
 notices+=`${pkg.name} ${pkg.version} (${pkg.license||'see upstream'})\n`;
 const files=(await readdir(folder)).filter(x=>/^(license|licence|copying|notice)(\.|$)/i.test(x));
 for(const file of files){try{notices+=await readFile(join(folder,file),'utf8');notices+='\n';}catch{}}
 notices+='\n----------------------------------------\n\n';
}
await writeFile('dist/THIRD_PARTY_LICENSES.txt',notices);
