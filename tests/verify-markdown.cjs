'use strict';
const assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{buildSync}=require('esbuild'),Module=require('node:module');
const source=buildSync({entryPoints:['src/paper-markdown.tsx'],bundle:true,platform:'node',format:'cjs',external:['react'],write:false}).outputFiles[0].text;
const compiled=new Module(__filename);compiled.filename=__filename;compiled.paths=module.paths;compiled._compile(source,__filename);
const {remarkPlugins,rehypePlugins,preprocessMarkdown,MarkdownTable}=compiled.exports;
(async()=>{
 const Markdown=(await import('react-markdown')).default;
 const render=text=>renderToStaticMarkup(React.createElement(Markdown,{remarkPlugins,rehypePlugins,components:{table:MarkdownTable}},preprocessMarkdown(text)));
 let count=0;
 const table='| 方法 | 精度 |\n| :--- | ---: |\n| **方法 A** | 95% |\n| 方法 B | `90%` |';
 const plain=renderToStaticMarkup(React.createElement(Markdown,null,table));assert.ok(!plain.includes('<table'));const html=render(table);assert.match(html,/<table/);assert.match(html,/<thead>/);assert.match(html,/<strong>方法 A<\/strong>/);assert.match(html,/text-align:right/);assert.match(html,/role="region"/);assert.ok(!html.includes('[object Object]'));count++;
 const gfm=render('- [x] 完成\n- [ ] 待读\n\n~~删除线~~ https://example.com\n\n原文[^1]\n\n[^1]: 注释');assert.match(gfm,/type="checkbox"/);assert.match(gfm,/<del>删除线<\/del>/);assert.match(gfm,/href="https:\/\/example.com"/);assert.match(gfm,/data-footnotes/);count++;
 const code=render('```markdown\n'+table+'\n```');assert.ok(!code.includes('<table'));assert.match(code,/<pre>/);assert.match(code,/\| 方法 \|/);count++;
 for(let i=1;i<table.length;i+=7)assert.doesNotThrow(()=>render(table.slice(0,i)));assert.match(render(table),/<tbody>/);count++;
 const safe=render('<script>window.untrusted=true</script>\n\n[链接](javascript:alert%281%29)');assert.ok(!safe.includes('<script>'));assert.ok(!safe.includes('href="javascript:'));count++;
 const math=render(String.raw`行内 $E=mc^2$ 与 \(x_i\)。

$$
\mathcal{L}=\sum_{i=1}^{N} \frac{x_i^2}{2}
$$`);assert.match(math,/class="katex"/);assert.match(math,/katex-display/);assert.match(math,/annotation encoding="application\/x-tex"/);count++;
 const bracket=render(String.raw`\[\mathbf{R}\in\mathbb{R}^{3\times3}\]`);assert.match(bracket,/katex-display/);count++;
 const mathCode=render('```python\nprice = "$5"\nformula = "\\(x\\)"\n```');assert.match(mathCode,/<pre>/);assert.ok(!mathCode.includes('class="katex"'));count++;
 for(const fragment of ['$\\frac{', '$$\n\\sum_{', String.raw`\(x_`, '$x$ and $y'])assert.doesNotThrow(()=>render(fragment));count++;
 const malicious=render(String.raw`$\href{javascript:alert(1)}{click}$`);assert.ok(!malicious.includes('href="javascript:'));count++;
 console.log(`PASS: ${count} GFM table, extended syntax, streamed partials, code and safe Markdown checks`);
})().catch(e=>{console.error(e);process.exit(1);});
