# Win AI 0.1.0 验收（2026-10-18）

交付范围：独立网站、真实 New API 后台、本站品牌与文档、部署包与本机管理员访问助手。未更新行舟影视客户端，未配置真实上游、支付商户或客户账号。

## 已通过

- 模板证据：MaxForAi HTML 标题 New API；公开 `/api/status` 的 SystemName/SidebarModulesAdmin/API 信息等字段和路由与 New API 对应。没有进入或访问他人的管理权限。
- 官方 Linux 程序 SHA256 `0eb9bcda72b25f840226d2493f2ef1074471fa511298213bca89672add7ceee9`，与官方 checksums-linux.txt 一致。官方对应源码哈希见 upstream.json；原程序未修改。
- 独立服务 active；实测初始内存约 70MB，最大 512M；SQLite、日志、Unix 用户和 service.env 与行舟分离。
- live-smoke：Win AI 名称、本站地址、本站文档、保留署名、setup 完成、注册关闭；未授权模型/渠道/令牌/系统设置均拒绝。
- IPv4/IPv6 8317 后台端口防护规则存在；凭据与会话配置 root:root 0600。
- 子域名 A 记录新增成功，未覆盖原记录；DNS-01 证书签发，证书期至 2027-01-15，certbot.timer active，续期 hooks 已保存。临时验证 TXT 已清理。未额外购买服务器/域名，也未变更云防火墙规则。
- Nginx 配置测试、真实 HTTPS 首页/API、原行舟 healthz 正常；旧站点配置未改。曾实测 reload 后旧默认证书短暂返回：失败 trap 恢复新站配置后退出；增加有限重试后部署成功。
- 真实 Chrome 经本机 SSH SOCKS：Win AI 首页品牌与状态、复制地址、390/768/1440 宽度无横向溢出、文档三语言切换、管理员登录、概览/渠道/API 密钥/用户页、登录刷新持续有效、4 类支付/注册/setup 接口 403，无页面未捕获异常。截图与 result.json 在 `tencent/output/win-ai-browser/`。
- 本机 open-site.ps1 实际运行成功，使用独立 Chrome 配置与已有 SSH 授权；admin-login.ps1 -SaveOnly 实际通过 DPAPI 加密保存，未把秘密写入源码或终端。
- 独立 `unshare --net` 测试：临时网关数据库+本地假上游，创建渠道与下游令牌、GET 模型列表、非流式对话、SSE、替换上游密钥、错误令牌拒绝；假上游正好接收2次有效请求。生产渠道没有写入测试数据，真实付费调用0次。
- Python/JS/Windows PowerShell 5 语法检查通过。独立审查发现的初始化恢复与失败回滚两项已修正并复核关闭。

## 当前限制

普通域名公网 TLS 连接在当前 Windows 网络间歇性被关闭，Python/curl 和默认浏览器线路可复现；服务器本机访问正常，直连 Chrome 曾成功但不稳定。**不能宣称普通用户外网稳定访问已通过。** 所有完整页面验收经拥有者 SSH SOCKS；该通道只解决拥有者当前查看与管理，不是面向客户的接入方案。正式向客户分发 API 前，需解决域名公网线路问题并跨网络复测。

无真实上游，因此未验证任何实际付费供应商、图片/视频私有协议或实际业务成功率。原生控制台内置的管理员额度是测试配额，不是充值记录；用量为0。首版不提供在线支付。

本机助手使用已有 SSH key，不将该 key 或 DPAPI 文件放入发布包；普通用户不应获取服务器授权。未进行源码上游数据库/协议修改，未宣称执行上游所有 Go 测试或跨三数据库测试。

发布包的本机/服务器哈希、大小和条目检查另外记录在 `tencent/output/win-ai-release.json`，避免把包哈希写入其自身内容导致循环。
