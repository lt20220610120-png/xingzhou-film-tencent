# 2.8.93 发布验收记录

日期：2026-10-29

## 实施

- 根因：协作 project-list 同时返回正常项目和回收站记录，旧自动化直接计数，导致同一导演项目被错误判断为多个协作项目。productionProject 现在排除 deleted_at、purge_after 和回收标记；优先任务明确ID，再选同源正常项目，无项目则创建并先保存ID。已有视频记录不会自动换绑。
- 美术接续：productionArtResumePlan 保留已发布且已有分发的集；缺清单的集进入 inventory，仅缺关联或发布的集进入 mapOnly，定向调用原 pipeline 后核实发布，不因为一张已有卡片跳过整阶段。
- 对话：ProductionConversation 展示可滚动日志和持久消息，选择模型、发送指令、执行结果和默认规则保存。production-chat 沿用管理员/联网IPC，Agent只读返回结构化动作；控制器负责继续、暂停、重读、同源项目切换。执行失败如实记录；聊天不整份覆盖运行任务。
- 默认流程按账号保存在 productionRules；新建任务继承并带入制作检查、对话与 OpenFilm 的任务上下文。规则属于自然语言制作经验，不能任意修改所有流水线参数或执行任意脚本。

## 验证

- npm run dist：2504/2504；构建及安装包运行时PASS（qa/packaged-smoke-2.8.93-1793260929316）。
- 三宽1280/1700/2232：选择模型/正常项目、排除回收站、发送对话、显示回复、保存规则、启动暂停与视频池范围下载通过。截图 output/playwright/furnace-2893-chat-*.png。
- 项目与执行控制16项定向测试通过：正常/删除副本、自动创建、明确ID、多正常副本、缺清单与缺发布定向恢复、聊天互斥及保存、已有视频不换绑。
- 独立复核发现美术早退恢复缺口，修复后复核闭合，相关16项独立运行通过。

## 安装包

- 本机：release/2.8.93/Xingzhou-Film-Tencent-Setup-2.8.93.exe
- 大小103884863字节；SHA256 132a9ae727aa636c7f2330270762048ea2d33fe1a31523634690b1f3406ece5a。

## 能力边界

UI与流水线回归使用模拟接口，不宣称已跑出真实整剧成片。对话使用现有本机Codex/ACP连接组件，支持列出的有限动作；ACP需兼容组件，尚未针对各家Agent逐一实测。完整新剧从提示词、生图、视频、Topaz到OpenFilm的付费联合实测仍待管理员试用。

## 发布核验

- 官方安装包：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.93.exe
- GitHub：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.93/Xingzhou-Film-Tencent-Setup-2.8.93.exe
- 官方与两份GitHub main/latest.json均以 update-trust 验证签名；version、size、sha256、installerUrl 与本机清单一致；公开安装包Range206、总大小和MZ文件头核验通过。
- 源码274e0b4；未安装覆盖当前本机应用，提供正式安装包进行升级。
