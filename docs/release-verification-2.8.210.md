# 2.8.210 验收

2026-11-26。基线为 `2.8.209` / `70544ef`。本轮修复带本机素材的项目首次邀请，以及共享准备中断后的恢复。

## 修复边界

- 首次共享素材签名核验项目所有者、本次邀请编号及待同步状态。签名仅授权向服务器生成的本项目对象键上传。资产、素材记录和成员一起在最终事务中保存。
- 待同步项目从项目列表、项目读取和导演关联核验中隐藏。普通成员、资产与媒体写入继续拒绝待同步项目。带全局管理员权限的非所有者同样拒绝。
- 支持续传 `2.8.209` 保存的邀请检查点。最终提交前可以改邀或改变身份。客户端在提交结果不明时使用原请求核对回执。

## 隔离验收

- `scripts/test.cjs` 的 3381 项 Node 测试、13 项发布等 Python 测试和 12 项本机 Qwen 测试通过。Vite 构建成功。
- `node scripts/fixtures/local-share-media-smoke.cjs` 在真实 Windows Electron 中通过。使用正式 preload、IPC、桌面存储和 Chromium 本机传输。先复现旧授权失败，再模拟中途上传失败、改邀和完成共享，保持四份本机素材并只完成一次提交。
- `cloud-backend/test/local-share-media-pg-smoke.cjs` 使用隔离 PostgreSQL、真实 HTTP 网关与云端鉴权和 COS 签名。通过回环对象存储传输图片、音色、参考素材和视频，覆盖中途恢复、原请求回执、改邀、目录与角色权限、项目不可见、空项目和已共享项目的成员变更。
- 正式 Windows NSIS 的打包运行时通过，包括首次启动、许可和凭据隔离、本地与云媒体读取、图片、音视频预览等。所有测试使用隔离账号、模拟对象存储与测试素材，真实付费调用为 0。

## 上线记录

- 源码 `49b3777`。云端备份 `/opt/xingzhou-backups/local-share-2.8.210-20261125T171325Z-tjt0jws8`，含运行环境、服务配置和 65,229,571 字节的数据库归档。数据库恢复清单和回滚脚本语法已核验。部署 7 个模块，数据库结构维持原版。公网 `/healthz` 正常，未认证网关返回 401。
- GitHub Release 458405881，上传工作流 45662154774。安装包 95,301,435 字节，SHA-256 `93b23b455ed3f9c92ae51deac51f06135925c13eafc9214e7d6e14d023dd47fd`。三份签名清单、GitHub 资产摘要及官网 HTTP 206 均已核验。
- 用 2.8.209 正式载荷在隔离 Electron 中完成检查更新、模拟中断后的续传、整包校验和安装交接。本机和官网镜像保留 2.8.206–2.8.210 五版。
- [官网下载](https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.210.exe) · [GitHub 下载](https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.210/Xingzhou-Film-Tencent-Setup-2.8.210.exe)
