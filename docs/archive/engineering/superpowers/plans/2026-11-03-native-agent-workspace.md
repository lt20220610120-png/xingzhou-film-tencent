# 2.8.120 原生制作会话与持续调度

用户已授权直接完成实现、验证与发布。保留紫白主色，不修改用户现有制作数据，不用真实付费生成验证。

目标：Codex制作对话实际具备完全访问，不再只读/授权失败；支持拖入/粘贴/选择图片视频文件；第一集等临时安排完成后自动恢复全剧默认流程，手动暂停优先；界面显示真实调度状态及独立自动流程计时。

参考：实际打开D:/Openfilm/OpenFilm.exe，只读检查app.asar。其前端强制Codex mode=agent-full-access，独立附件路径/字节IPC，持续ACP会话与工具事件；并非嵌入官方桌面窗口。未发现本机EVA Skill，采用程序包与实际界面分析。OpenAI app-server官方文档及本机原生schema核对sandbox/approvalPolicy/UserInput。

架构：行舟继续使用原生Codex app-server和自有项目身份/调度器，不改用户Codex全局设置。仅交互制作会话明确fullAccess=true，thread/start和每轮turn/start一致配置；后台结构化子任务维持原权限。ACP仅当前授权会话的权限请求选择允许选项。附件主进程验证账号/任务和真实文件，图片用localImage原生输入，视频及一般文件附真实本机路径，粘贴图片存当前项目对话附件目录；不把视频整体塞进IPC或提示词。

- [x] 失败回归：实际线程/turn完全访问、ACP授权只作用本会话；附件原生输入/steer、越账号拒绝、拖入大视频只传路径。
- [x] electron/production-agent.cjs、production-host.cjs、production-attachments.cjs；preload主框架IPC；真实Codex临时夹具写入/复制文件并识别图片探针，不触碰用户项目。
- [x] core/productionExecutionScope.js与controller：临时范围默认after=resume_default，完成后恢复默认终点并继续同一执行器；旧暂停范围迁移为优先安排；明确pause取消后续自动接续。
- [x] core/productionRunState.js与运行工作台：executorActive、累计runtime与当前等待原因；退出executor不能仍显示运行；对话回合用时和自动化计时分开。
- [x] 聊天composer支持附件预览/移除、拖入/粘贴/选择、仅附件发送、权限标识；持久化用户消息附件，实时命令/文件结果详情。
- [x] 全量/构建/三宽UI/独立复核/真实原生探针，打包运行与公开发布120，更新记忆与交接。

关键复核：暂停与优先完成竞争、浅终点优先完成不能伪装默认终点完成、异步旧范围后期不能阻止全剧、附件不能直接污染默认规则、重新连接权限不降级、图片原生输入不假报视频视觉能力。

