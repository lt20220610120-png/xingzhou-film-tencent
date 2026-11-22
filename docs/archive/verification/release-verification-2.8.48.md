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

补充实际连接：设置中文app名的真实Electron连接生产证书固定传输，自动OAuth普通角色1/额度0、再次进入同账本、钱包、换号隔离、源停用后真实API Key与原生会话403均通过，output/win-ai-sso-result.json ok=true。两名QA通过原生正式安全证明删除，output/win-ai-2848-cleanup.json记录原生/来源各2、真实用户修改0、root-only凭据移除。

发布核对：正式GitHub Release资产digest/大小/HEAD200、两份main签名清单一致，官方IP镜像签名/Range65536与总长度通过。output/release-2848-public.json、release-2848-mirror.json。网站来源包50502396字节，SHA256 6512515ae6d8185eec4bf4bdfb83a3f9118901b8cf8893b360cf9dd3edab6152，服务器与本机一致，逐文件内容及ZIP CRC校验通过。公开源码包是当前任务最终修正版；普通公网TLS仍失败，不把拥有者通道当作外部访问证明。

静态补充：owner标记下原生SPA剥离admin参数时仅用原始history.replaceState恢复，避免强制文档导航可能造成循环；路由与web-auth10项专项通过。此修正不作为冷加载timeout的已确认根因。

最终拥有者浏览器验收：output/win-ai-owner-final/result.json passed=true，真实站长登录、dashboard、支付网关、刷新用户页、钱包及公开收款指南无管理链接/无未捕获异常均通过。payment截图已检查，条款未代确认、表单锁定符合原程序设计。早先channels/users/models/usage/task/model-pricing实际截图另在output/win-ai-browser。
