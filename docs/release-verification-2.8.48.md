# 2.8.48 / Win AI 0.3.0 验收

2026-10-18，基线1b5cfd2。用户截图安装版2.8.47在 `/api/win-ai/bootstrap` 报ERR_UNEXPECTED(-9)。

根因：真实安装版中文app名进入默认User-Agent，Electron43.2 `protocol.handle` 内部先构造Fetch Headers，因中文不满足ByteString而失败，尚未调用自定义传输。实际安装app.asar与源码相同，开发版英文UA测试不能覆盖。最终仅对Win AI独立会话清理UA非ASCII，保留TLS CA与证书指纹；改为主进程一次性POST交接，校验303+固定/start，浏览视图GET进入。

- 新增安装运行时模拟传输，首次复现同类-9，修复后真实win-unpacked运行通过。证据 `qa/packaged-smoke-2.8.48-1792319581708/report.json`：bootstrap POST、start GET、私有HttpOnlyCookie、sandbox、无预加载桥、关闭清理全部通过；真实账号、付费模型及真实用户资料没有进入该测试。
- 最终 `npm run dist`：2215测试通过、0失败、Vite构建、NSIS制品和上述运行时检查通过。专项先红后绿覆盖中文UA、失败/外部重定向拒绝、退出换号和停用清理。
- Win AI侧栏和页标题改Network图标，API接口保留钥匙。用户明确否决管理按钮；客户端不新增，公开docs/payment页也移除旧管理链接。独立root入口及DPAPI拥有者助手保留。
- 网站0.3.0已部署，真实浏览器注册/登录/找回表单、钱包、退出再登录及同账本验证见 `win-ai/docs/verification-0.3.0.md`。网页测试用户已清理。管理端实际查看渠道、用户、模型、用量、任务日志及模型定价；后续支付页刷新达到原生登录限流，不更改生产限制。
- 增加本机owner-status只读汇总网关进行中/等待中异步任务与渠道、普通账本数量；不当作同步请求并发或全部影视本地任务。
- 独立复核未发现阻断。另复现打包失败时exitCode被退出钩子覆盖，改process.exit(1)保证失败不续发；首次失败后停止上传，最终重新通过全套检查才发布。

最终安装包：`release/2.8.48/Xingzhou-Film-Tencent-Setup-2.8.48.exe`，103629780字节，SHA256 `45fbc3c04f0865d758572a41b10b8813ac5e803276dd07bdd556494693e4ae1c`。

真实上游/售价/收款商户尚未配置，未付费调用或真实充值；扫码图片不能代替商户接口。用户称ICP备案已提交待审核，未核实最终结果。公网直连和外部支付回调仍需跨网络验收，拥有者SOCKS与软件专用传输不代替公众可达性。
