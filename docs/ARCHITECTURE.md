# 架构与维护

## 模块

- `main.js`：任务聚合、精确写回、计时、首页入口。
- `navigation.js`：知识与项目目录视图。
- `daily.js` / `daily-core.js`：记录整理、加密本地存储、Markdown 保存。
- `papers.js`：论文库、分类、摘要、聊天与选区快捷操作。
- `paper-reader.js`：连续页占位、附近页面渲染、PDF.js TextLayer。
- `paper-core.js`：提取文字、引用校验、上下文选择。
- `paper-service.js`：论文数据持久化、MiniMax 请求与 PDF 文档缓存。
- `paper-stream.js`：HTTPS + SSE；UTF-8 分片、结束判断、AbortSignal、超时。
- `paper-layout.js` / `pdf-layout-worker.py`：独立翻译进程、版本化产物、失败保护。

## 问答路径

选区模式只提供选区和同页附近段落，上下文上限约 6,000 字符。全文模式选择相关段落，上限约 42,000 字符。均仅访问当前论文；附带近期对话，失败或取消的历史回答不再次作为模型事实上下文。

开始请求后，UI 立即创建问题与回答气泡。SSE 内容通过动画帧合并更新正文；完成后渲染 Markdown 与引用。不会重建 PDF 阅读区。阅读历史时，用户离开聊天底部就不强制追随输出。

停止按钮触发 AbortController 并销毁 HTTPS 请求。已收到的内容保存为 cancelled；网络断开、超时或截断保存为 error，供用户查看与重试。部分回答不是完整结论。

## 密钥边界

密钥由系统加密能力保存至知识库之外；正文请求头只在内存中创建。PDF 翻译密钥通过子进程 stdin 传递，不写到命令行参数或配置文件。不要复制本机加密缓存进入仓库。

## 可复现构建

`python3 scripts/build.py` 将本地 CommonJS 模块内联到一个 `main.js`；只复制样式、清单和 Python worker。构建不读取知识库、不读取密钥。`scripts/install.py` 必须显式指定目标知识库。

## 测试边界

离线测试通过不等于网络或 UI 可用。发布前需在隔离的演示知识库验证：导入 PDF、三个版本滚动与选择、快捷解释、首段在完成前可见、停止后保存部分内容、重试成功、主题切换与窄窗口。不要用真实私人记录制作公开截图。
