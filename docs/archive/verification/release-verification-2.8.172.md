# 2.8.172 验收（2026-11-16）

## 问题与定位

项目协作的图片与提示词分别已共享，但提示词—清单卡片的关联决策原来由 `prompt-art-store.cjs` 按账号保存为本机文件；`prompt-art-*` IPC 又统一要求管理员。普通受邀协作者拿不到同一份关联，项目刷新也未重新读取关联版本。邀请者点击生成时保存分镜配置，才间接让他人看到参考图。

## 实现

- 协作项目将关联快照、决策、版本、分发状态及解析卡片需要的核实清单保存到 `analysis_progress._sharedPromptBinding`；独立导入的非项目流程保留原存储与权限。
- `project-prompt-binding.cjs` 按项目成员权限读取；写入仅制片/美术/兼任美术协作者。云端事务行锁再次检查角色、锁定和删除状态，以 revision/writeId 防止并发覆盖并处理同请求重试。
- 旧本机关联首次打开时迁移，已有远端版本优先；邀请成员前先将旧关联放入项目快照。个人项目仍只存本地，邀请后进入原项目共享流程。
- 清单与分镜按共享 revision 重新读取，保留真正的本机未提交编辑；采用图变更按当前资产解析。分享时剔除本机路径和凭据字段，旧分集/过期正文清单不会阻挡当前关联保存。
- 视频生成策略不变：本机结果链接及窗口预览，显式上传后才出现在共享媒体；自动化下载保留。新增两账号回归核验此边界。

## 验证

- 全量 **3129/3129**，Vite 构建通过；最终日志 `output/172-tests-final.log`、`172-build.log`。
- 两账号关联/图片/采用图刷新、无已发布清单时读取、保留本机编辑、迁移幂等、并发冲突、角色限制、路径清理、过期清单过滤、个人项目重启及邀请快照、视频显式共享均覆盖。
- 两个真实 Electron BrowserWindow、独立 session、实际清单核实和分镜组件、真实 Electron HTTP 请求调用云端路由：受邀者先打开，原作者迁移后受邀者刷新，清单出现“本条已关联”，分镜显示三项 @image 与可解码图片；总计一次迁移保存、零生成请求。图片为隔离测试 PNG，未修改用户项目。`output/172-ui.json`、`172-guest-review.png`、`172-guest-storyboard.png`。
- 服务器路由相关 7 项通过；真实 PostgreSQL 临时表验证行锁、成员权限、冲突、幂等和保留其他 review。无生产业务表数据写入、无 schema 修改。`output/172-backend-test.log`。
- 独立复核权限检查、账号/目录变化保护、共享版本刷新、旧本机迁移、原有发布/保存更新保留共享字段。未调用任何真实付费生成。

## 部署与发布状态

云端已部署 `collab.cjs`、`repository-extras.cjs`、新增 `prompt-binding.cjs`；健康检查及 systemd active 通过。部署前对比线上两份文件与 Git 基线 SHA256 一致，回滚备份 `/opt/xingzhou-backups/prompt-binding-2.8.172-20261116T024114Z`。日志 `output/172-deploy.log`。

已公开发布，实现 `d9bf916`，Release `446550645`，上传工作流 `43793974588` 成功。正式 NSIS 内应用运行验证通过，7 份关键 ASAR 文件与源码/构建逐字节一致。初次额外 ASAR 检查因 Windows 多级路径分隔符报未找到文件，改用 path.normalize 后确认文件存在且完全一致，正式运行验证此前已通过。

- 安装包大小 **104131082** 字节，SHA256 `d7f2353118d9f25b1bb354f9eab6314bb52e203853c5e696610f8ba76be74fa0`。
- 官网：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.172.exe
- 本机：D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.172/Xingzhou-Film-Tencent-Setup-2.8.172.exe
- 三份公开 latest.json 均验签通过，GitHub 资产 digest/大小与正式包一致；官网 Range 206 内容与本机一致，源站完整 SHA256 一致。
- 真实 Electron 更新弹窗读取公开 172 版本，以本机前段加官网末段续传，完整包校验及安装回调通过；未强制安装用户运行中的客户端。
- 证据：`output/172-artifact.json`、`172-public.json`、`172-update-ui.json`、`172-stage.log`、`qa/packaged-smoke-2.8.172-1794796918527`。

## 旧项目使用边界

参与者均需升级。原操作人需在原机器/账号打开一次该项目的清单核实或分镜，旧本机关联才能同步；其他成员刷新项目读取。没有远程替用户重做关联或改写其项目。视频链接可能受供应商有效期限制，显式上传共享入口继续保留。
