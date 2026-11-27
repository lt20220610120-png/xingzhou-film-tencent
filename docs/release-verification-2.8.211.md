# 2.8.211 验收

2026-11-27。基线为 `2.8.210` / `bddac73`。验证使用隔离资料与模拟生成，真实付费调用为 0。

## LibTV

- 核对官方 CDN 的 Windows CLI 1.2.0，分别固定压缩包和可执行文件 SHA-256，隔离执行 `--version` 与 `model/node --help`。官方通用下载指针仍返回 1.0.2，采用已核验的固定版本。CLI 1.2.0 仍要求 `-s model=` 传展示名。Seedance 2.5 必须由当前空间同模型编号的有效 schema 确认后才使用已知名称。
- 分镜顶部及单条分镜的参数重试均发起显式刷新。在 1280、1600、1920 像素隔离 Electron 中验证刷新中状态、防连点、失败原因、恢复与生成进度。直连、系统代理、自定义代理模拟短时阻塞均可重试，空目录及异常参数不会成为有效缓存。每条付费任务只发送一次运行命令。

## WorkBuddy

- [官方 v2.11.23](https://github.com/ithtelab/workbuddy-manager/releases/tag/v2.11.23) 发布包为 9,081,392 字节，SHA-256 `dad8a0ce61e745b4d3b0930f07b8c08f79fa189be8f6bcb934037b06ed44bd37`。隔离测试覆盖桌面代理、来源限制、摘要、大小、归档安全、备份后更新和失败回滚。短时会话失败时同一登录身份有短暂重验窗口。
- 本机从 v2.11.13 升至 v2.11.23。安装前备份 `C:/Users/11599/AppData/Local/Xingzhou-WorkBuddy-Backups/workbuddy-kHh8UR`，4,030 个文件逐一比对摘要，备份目录和凭据文件限制当前 Windows 用户只读访问。另有独立兼容性备份 `C:/Users/11599/AppData/Local/Xingzhou-WorkBuddy-Backups/workbuddy-WsrLlX`。升级前后本机只读检查均为 15 个已登录账号、15 个已启用、15 个可调度。账号身份及凭据文件摘要保持一致。

## 云端业务与桌面隔离

- Node 18.19.1 / PostgreSQL 16.14 在全新库和 2.8.210 升级库均通过。验证关联权限、成员资格/制片保护、登录事务回滚、只读结算、4xx、乱序发集/删集、素材对象清理失败重试和首次共享确认。COS 删除使用模拟接口。云端原有项目数据未用于测试。
- 上线前完整备份位于 `/opt/xingzhou-backups/business-hotfix-2.8.211-20261127T081526Z-xh4hcuqx`，数据库归档 72,981,320 字节，恢复清单及回滚脚本语法已检查。部署 12 个业务文件，附加素材清理队列和索引。公网健康检查正常，未认证网关保持 401。Win AI 源码和服务配置保持原样。
- 桌面隔离验证覆盖旧分享恢复、提交回执、资料目录切换、退登取消、账号切换、Muse 配置清理，以及音色更新、新图预览和生成监控。1280、860 像素已用真实 Electron 验证新增交互。
- 对无法确认所属账号的历史草稿和活动记录，原文件保留，账号视图只展示可确认归属的数据。未认领的旧生图回执需要显式解除。

## 发布记录

- 3,406 项 Node 测试、13 项发布等 Python 测试及 12 项本机 Qwen 测试全部通过。Vite 构建与正式 NSIS 运行时通过。
- 源码 `d2ef1f2`，GitHub Release 460323032，上传工作流 45964647243。安装包 95,307,048 字节，SHA-256 `13a95f1bdf2aba8804ecf1b64c508719848c1f3002b4e193e0fbe80a1a1b5650`。
- 官网签名清单与 GitHub 两个主分支上的清单一致，Git blob 为 `3929884af8442bf5e7b02c0ccdee4457974f5b25`。源码仓库的 Raw 短地址在发布后短期返回旧缓存，使用显式分支路径和对应提交核对了最新签名。
- 使用正式 2.8.210 的更新代码在隔离 Electron 中完成检查更新、模拟中断、范围续传、整包校验和安装交接。本机和官网镜像保留 2.8.207–2.8.211 五版。
- [官网下载](https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.211.exe) · [GitHub 下载](https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.211/Xingzhou-Film-Tencent-Setup-2.8.211.exe)
