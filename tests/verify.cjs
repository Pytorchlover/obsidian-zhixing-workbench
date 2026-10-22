// Meaningful write-integrity checks; no vault files are touched.
const assert = require('node:assert/strict');
const Module = require('node:module');
const original = Module._load;
Module._load = function(name, ...args) {
  if (name === 'obsidian') return {Plugin:class{},ItemView:class{},MarkdownRenderChild:class{},FuzzySuggestModal:class{},PluginSettingTab:class{}};
  return original.call(this,name,...args);
};
const {replaceTask,appendSection} = require('../src/main.js').testing;
Module._load = original;
const task={raw:'- [ ] 校验同步 📅 2026-10-21',line:2};
assert.equal(replaceTask('# 记录\n\n'+task.raw+'\n后文',task,true),'# 记录\n\n- [x] 校验同步 📅 2026-10-21\n后文');
assert.equal(replaceTask('新增行\n# 记录\n\n'+task.raw,task,true),'新增行\n# 记录\n\n- [x] 校验同步 📅 2026-10-21');
assert.throws(()=>replaceTask('新内容\n'+task.raw+'\n其他\n'+task.raw,{...task,line:0},true),/源任务已变化/);
assert.throws(()=>replaceTask('- [ ] 同时编辑后的另一件事',task,true),/源任务已变化/);
assert.equal(replaceTask('- [ ] 原任务\r\n正文\r\n',{raw:'- [ ] 原任务\r',line:0},true),'- [x] 原任务\r\n正文\r\n');
const updated=appendSection('# 今天\n\n## 今日待办\n\n## 工作记录\n\n内容\n','今日待办','- [ ] 新任务');
assert.ok(updated.indexOf('- [ ] 新任务')<updated.indexOf('## 工作记录'));
assert.ok(updated.includes('内容\n'));
assert.equal(appendSection('# 今天\n','专注记录','- 21:00 · 专注 25 分钟'),'# 今天\n\n## 专注记录\n\n- 21:00 · 专注 25 分钟\n');
const fenced='## 工作记录\n\n````text\n## 今日待办\n```\n````\n\n## 专注记录\n';
const added=appendSection(fenced,'工作记录','新记录');assert.ok(added.indexOf('新记录')>added.indexOf('````\n'));assert.ok(added.indexOf('新记录')<added.indexOf('## 专注记录'));
console.log('PASS: 10 checks (writeback, moved task, conflict rejection, CRLF, section boundaries)');
