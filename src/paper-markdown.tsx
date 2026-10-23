import React from 'react';
import remarkGfm from 'remark-gfm';

// MarkdownTextPrimitive is a base renderer; GFM is explicitly opt-in.
export const remarkPlugins=[remarkGfm];
export function MarkdownTable({children,node:_node,...props}:React.ComponentPropsWithoutRef<'table'>&{node?:unknown}){
 return <div className="zd-aui-table-scroll" role="region" aria-label="回答表格，可左右滚动" tabIndex={0}><table {...props}>{children}</table></div>;
}
