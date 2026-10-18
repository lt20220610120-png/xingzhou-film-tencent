# Win AI 统一身份（2026-10-18）

用户已明确要求直接执行：行舟影视注册一次，从左侧 Win AI 进入即登录，不再注册网站账号。随后用户将支付纳入本次范围，详见 payment-setup.md。

采用官方 New API 自定义 OAuth2 提供商，行舟影视为唯一身份来源；以不可变用户 UUID 关联，禁止按用户名或邮箱合并。New API 内部建立独立账本用户，密码不复制，零初始额度，不授予行舟普通用户网关管理权限。注册/密码恢复/停用仍在行舟完成。

桌面主进程验证当前行舟会话，申请60秒一次性票据，绑定随机验证器的 SHA256。独立沙盒 WebContentsView 经 HTTPS POST 交接；票据/密码不进入 URL 或主界面 renderer。官方 OAuth state 与客户端 secret、严格回调网址保护授权码交换；授权码单次、60秒，资料令牌短期。所有授权材料在 PostgreSQL 哈希存储并关联原会话，原会话删除级联失效。

新建 PG grants/session-links 表，现有账户/密码/余额不迁移。Win AI 由 HTTP auth_request 增加身份生命周期检查：只读查询固定版本 SQLite 的 OAuth 绑定及原生会话标识；真正令牌/密码鉴权仍交原始 New API。SSO 网页会话关联原行舟会话；退出、重置密码、删除会话后失效。对已关联用户的外部 API Key 每次核对行舟账号未被停用/删除；退出网页不批量撤销外部自动化令牌。故障关闭 Win AI 访问，不影响行舟其他接口。

桌面隔离 session 只允许 Win AI 同源、禁止 Node/preload/远程 IPC、拒绝权限与任意跳转，退出/换号清理会话。针对已确认的域名网络故障，复用既有官方 IP CA 和证书指纹，仅在独立页面传输中按固定 Host 路由，不关闭 TLS 校验，也不分发 SSH 权限。

实施顺序：先写身份生命周期/重放/跨用户/权限测试观察失败；实现后端与 migration；配置官方 OAuth 和 Nginx 并在临时数据库验证；实现隔离桌面页面与左侧栏目并实测；全量客户端测试、构建、独立审查、2.8.46 安装包发布及更新链路核对。公网域名线路限制仍单独记录，客户端受保护 IP 传输须实际验证后才能宣称无需 SSH。

## 实际实现补充

原生普通角色为1（固定版本 common.RoleCommonUser），并非旧版常见的10。来源UUID在win_ai_user_links首次固化且来源删除后保留失效标记；OAuth解绑不能解除来源生命周期限制。原生JWT/refresh、PAT、legacy PAT、relay、只读用量接口分别匹配实际凭据，覆盖Claude/Gemini/WebSocket/Midjourney优先级及Go查询参数空值规则。

桌面内置https协议转发需手动保存并发送安全Cookie、补同源POST Origin；隔离https.Agent禁止TLS session resumption以保证新连接能取得完整证书，保留CA与指纹验证。gzip流式解压加快原生前端。Win AI API模型请求另用无Cookie传输，不复用网页会话或原行舟令牌。

支付回调先在只读SQLite中核对原订单金额，再交原生网关验证签名与幂等入账。商户资料和模板站长声明尚未填写/确认；生产真实收款关闭。外部公网线路仍是实际开通支付与对客API的前置验收事项。
