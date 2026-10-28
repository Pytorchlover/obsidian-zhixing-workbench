import React from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {normalizeMathDelimiters,escapeCurrencyDollars} from '@assistant-ui/react-markdown';

// MarkdownTextPrimitive is a base renderer; GFM is explicitly opt-in.
// A standalone \[...\] normalizes to $$...$$ on one line. Preserve display intent.
function remarkDisplayMath(){return (tree:any,file:any)=>{const source=String(file);const walk=(parent:any)=>{if(!parent.children)return;parent.children=parent.children.map((node:any)=>{if(node.type==='paragraph'&&node.children?.length===1){const child=node.children[0];if(child.type==='inlineMath'&&source.slice(child.position?.start.offset,child.position?.end.offset).startsWith('$$'))return {type:'math',value:child.value,data:{hName:'pre',hChildren:[{type:'element',tagName:'code',properties:{className:['language-math','math-display']},children:[{type:'text',value:child.value}]}]}};}walk(node);return node;});};walk(tree);};}
export const remarkPlugins=[remarkGfm,remarkMath,remarkDisplayMath];
export const rehypePlugins=[[rehypeKatex,{throwOnError:false,trust:false,strict:'ignore'}]] as any;
export const preprocessMarkdown=(text:string)=>escapeCurrencyDollars(normalizeMathDelimiters(text));
export function MarkdownTable({children,node:_node,...props}:React.ComponentPropsWithoutRef<'table'>&{node?:unknown}){
 return <div className="zd-aui-table-scroll" role="region" aria-label="回答表格，可左右滚动" tabIndex={0}><table {...props}>{children}</table></div>;
}
