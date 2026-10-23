# 2.8.67 发布验收

日期：2026-10-24（Asia/Shanghai）

- `npm test`：2364/2364 通过；前一次运行有一个无关邮箱网络抖动，重跑清零。
- `npm run build`：通过。
- 三宽 Edge 界面验收：`output/license-fixed-ui.json`，1120/1500/2048 均通过；覆盖新账号启动、到期锁定、续卡保留草稿、老账号无卡密界面、恢复授权和切换账号。
- 安装包冒烟：`qa/packaged-smoke-2.8.67-1792776004325/report.json`，`success=true`。断网月卡路由保持授权页锁定，无进入工作区按钮，Electron 桥接、安全策略、媒体、文档和既有模块检查通过。
- 安装包：103818242 字节，SHA256 `1a95f6024e935b56d2d5a974897b055bad8cbb519b01eb207c9e06fa4d33d18c`。
- 发布清单与下载：`output/license-2.8.67-release-verify.log`；两个 GitHub `main` 清单、GitHub 资产 digest、下载 HEAD、官方镜像固定证书与 Range 206 均通过。
- 后端只替换 `software-license-service.cjs`，部署前校验旧摘要 `330ebe75ec2e06f8339c6de4b3fd049a34632bf6dbd6f24b7d00cc76fdd392ab`，健康检查通过；备份 `/opt/xingzhou-backups/software-license-2.8.67-20261023T171851Z`。
- 未操作真实付费生成任务，未强制关闭或覆盖用户当前软件。
