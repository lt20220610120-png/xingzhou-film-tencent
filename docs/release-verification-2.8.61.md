# 2.8.61 管理员工作流验收

2026-10-22。用户授权继续完善工作流、在管理后台增加总控界面，并取消 private 版本。基于当前公开 2.8.60 / 5c37f17 合并专用 2dc23cd，冲突保留道具本体命名、原关联修复与当前条 AI；合并提交893be48。

## 实现范围

- 普通版本包，新增管理后台工作流页，支持配置快照、开始、暂停、进度、问题、输出目录、后期规则。
- 半自动：既有人工选图，经 AI 文字检查后生成；自动接续：按条运行 importedArtAuto 身份与关联，再复用原 generation-submit 验证及 generation-jobs。后端读取当前接口密钥，不写入输出清单。
- 主进程独立任务引擎，持久化 submitting 后才发请求；重启手动恢复、按workflowRunId/itemId找原任务，不重发未知付费请求；后台每5秒检查，尊重提供方 nextPollAt。
- 每集条目全部下载并复制摘要一致后写交接清单，按序号/集场条排序；原始素材/超分素材/成片隔离。Topaz、剪辑和剧本到美术的全自动前置明确待接入。没有伪造完成状态。
- 服务端session校验管理员与稳定令牌；主进程工作流入口和关联入口都检查，旧private设备标记不再决定能力开放。普通原图视生成保持。

## 验证

- 全量2338/2338、0失败；output/admin-workflow-tests-final.log。第一轮4个文档VM用例因新增顶层timer失败，改到app.ready生命周期，文档20/20及全量通过。
- 新工作流与参数聚焦8/8，output/admin-workflow-focused.log；权限隔离、创建不提交、原片按集提前交接、重启防重、提交不明不重发、暂停晚回不生成、恢复旧任务、失败仅拦截该条、非法集数与模型参数拦截。
- 真实React/Edge三宽1280/1700/2232，qa/admin-workflow-ui.cjs，output/admin-workflow-ui.json：设置/创建/开始/暂停/集进度/切页恢复/普通用户无入口，0页面异常、无横向溢出。截图已查看。UI使用模拟API，后台另以真实文件临时目录和注入的模拟生成验证。
- 生产构建通过，output/admin-workflow-build-final.log。NSIS与实际Electron运行PASS，output/admin-workflow-package.log；qa/packaged-smoke-2.8.61-1792654835871，adminWorkflowGate.bridge=true，4个未登录调用拒绝，associationDisabled=true，errors=[]。
- ASAR版本2.8.61、privateTrial=false；admin-workflow.cjs/adminWorkflow.js与最终源码逐字节一致。
- 未运行用户真实剧本、付费AI或视频，未关闭或替换用户运行中的客户端。未调用未经验证的Topaz或剪辑命令。

## 独立复核与限制

已复核前端管理员挂载/后端session权限、登录变化停止、提交前持久化、等待结果不重发、输出路径/摘要、共享关联CAS与输入模型上限。普通用户拒绝同时有引擎行为验证及真实安装包IPC证据。

创建时固定源快照，原项目后来编辑不自动合并；生成前重查可重跑AI，不等于重新导入项目。下游当前交付清单而非执行器。AI文字判断不能保证图像语义完全正确；看图核对保留现有管理员关联入口。


## 发布验证

- 普通正式版 2.8.61，源码 b1e932a，公开更新清单 ebae1ef；未再制作 private 安装包。
- 安装包 103807855 字节，SHA256 fd2cb8e04ee03032f34572017f3e5f24b809fa21eeaceba86a023082b4dd12c6。
- 公开：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.61/Xingzhou-Film-Tencent-Setup-2.8.61.exe
- 本机：C:/Users/11599/Documents/ChatGPT/行舟影视/tencent/release/2.8.61/Xingzhou-Film-Tencent-Setup-2.8.61.exe
- 双仓库 main/latest.json 与官方 IP 镜像签名、版本、大小、散列通过；GitHub资产digest一致、下载HEAD200，官方IP视频安装包Range206/MZ/总长一致。output/admin-workflow-release-verification.json。
- 发布日志 output/admin-workflow-publish.log；镜像安装器校验后原子发布，未部署业务服务或更改用户权限。
