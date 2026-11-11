# 2.8.148 验收记录（2026-11-11）

## 根因与修复

- 真实客户端 `startup.log` 中反复出现 `Cannot find module '../cloud-backend/src/storyboard-merge.cjs'`。`createProjectCollab()` 在统一就绪流程中抛错后，项目服务和后续 `setupWorkBuddy()` 均未完成初始化；旧 smoke 只检查 bridge 和窗口，因而误报通过。
- 打包 staging 已复制项目模块，但 electron-builder 的最终文件规则只保留 `cloud-backend/shared`，导致 staging 与安装包内容不一致。本版将 11 个实际运行模块逐个纳入 `build.files`，并直接在最终 `app.asar` 中检查存在性和非空内容。
- 完整移除网络分流卡片、TUN 兼容、物理网卡/DNS、三个设置 IPC 及云端、COS、素材、更新传输中的物理路由。恢复原系统网络和代理行为；保留限定域名的 LibTV 系统代理/直连 CONNECT、云端固定证书备用连接、写入超时和不确定写入不重放保护。
- 不读取、不删除用户已有 `network-routing.json`，不更改 Clash、TUN、系统代理或真实项目。

## 已完成验证

- 定向网络测试通过；`npm test`：3010/3010 通过，记录 `output/148-tests.log`；`npm run build` 通过，保留既有大包体积提示。
- 真实 React 界面在 1280、1700、2232 三档宽度通过：网络分流开关、物理网络和检查连接均不存在；云端临时素材与当前版本卡片保持；无脚本错误或横向溢出。证据 `output/142-ui.json`、`output/142-ui-*.png`。
- NSIS 安装包及 win-unpacked 实际进程验收通过：`qa/packaged-smoke-2.8.148-1794396687152/report.json`。最终 ASAR 含全部 11 个项目模块，不含 `cloud-network` 或 `NetworkRoutingSettings`。
- 新 smoke 读取隔离环境的真实 `startup.log`，并实际调用 `collabListProjects()` 和 `workBuddyStatus()`。两项均进入已初始化服务，在无登录隔离环境分别返回正常登录/管理员授权提示；未出现 `ready Error`、模块缺失、`undefined.listProjects` 或“WorkBuddy 集成尚未初始化”。媒体、沙箱、授权、画布等既有运行时检查同时通过。
- 安装包 104017644 字节，SHA256 `f354e52c9d474e3bcdd7ebdb731aecf8ac3300de90fdd57895c0e1b3b7032bc7`。未进行真实付费生成、真实项目写入或用户网络设置修改。

## 发布核验

发布后在下方补充官网/GitHub 整包、摘要、Ed25519 清单签名和软件内更新检测结果。
