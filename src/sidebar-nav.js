'use strict';
// Every workbench surface shares the same destinations and ordering.
const ITEMS=[['desk','工作台','house'],['daily','每日记录','calendar-days'],['papers','论文','graduation-cap'],['recommend','每日推荐','sparkles'],['distill','知识沉淀','notebook-pen'],['projects','项目空间','folder-open'],['knowledge','知识索引','book-open']];
function renderNav(nav,plugin,button,{active,actions={},run=fn=>fn()}={}){
 nav.setAttribute('aria-label','个人空间导航');
 const defaults={desk:()=>plugin.openDesk(),daily:()=>plugin.openDaily(),papers:()=>plugin.openPapers(),recommend:()=>plugin.openRecommendations(),distill:()=>plugin.openKnowledge(),projects:()=>plugin.openDirectory('项目总览'),knowledge:()=>plugin.openDirectory('wiki/index.md')},buttons={};
 for(const [id,label,icon]of ITEMS){const b=button(nav,label,id===active?'zd-nav-active':'',()=>run(actions[id]||defaults[id]),icon);b.dataset.navId=id;if(id===active)b.setAttribute('aria-current','page');buttons[id]=b;}
 return buttons;
}
module.exports={renderNav,ITEMS};
