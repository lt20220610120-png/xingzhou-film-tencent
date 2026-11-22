# Win AI 0.3.0

基于 QuantumNous/new-api 官方 v1.0.0-rc.45 原程序的自有中转站。站点品牌、首页、接口文档和钱包属于 Win AI，账号身份由行舟影视管理。

- 网站：https://winai.xingzhoufilm.cn/
- 控制台：https://winai.xingzhoufilm.cn/dashboard/overview
- API：https://winai.xingzhoufilm.cn/v1
- 接口文档：https://winai.xingzhoufilm.cn/docs
- 收款步骤：https://winai.xingzhoufilm.cn/payment-setup
- 行舟客户端：2.8.48，左侧 Win AI 自动使用当前账号，无需再次注册。

## 使用和运营

2026-10-24 性能与品牌更新：用户反馈 ICP 已通过；本次域名首页/控制台静态资源可读取，客户端固定证书/IP路径也已复核。nginx压缩类型补齐`text/javascript`，5.1MB主脚本传输降至约1.83MB；本机单次对照13.5秒→4.5秒，不代表所有网络。网站`brand.svg`及控制台favicon改为用户提供的Wink图标。增量部署脚本`scripts/deploy-ui-refresh.py`，备份`/opt/xingzhou-backups/winai-ui-2869-20261023T191317Z`。客户端2.8.69切页复用已鉴权控制台并提供左下圆形刷新。下文旧网络受限状态按原日期保留；支付平台外部回调和真实上游仍以单独验收为准。

普通用户可在浏览器访问 `/login`、`/register`、`/recover`，已有行舟影视账号可直接登录；软件内仍自动交接。网页新注册使用邮箱验证码，不需影视邀请码；来源账号 roles 为空、非管理员及制片人，影视权限需另行开通。原生网关只通过 OAuth 建立普通角色、零额度账本，禁止原生密码注册，密码不复制到网关。

网页登录仅设置 Secure HttpOnly 身份 Cookie，来源会话令牌不返回页面。原生控制台退出验证成功后，撤销本次网页登录的来源 session；桌面交接来源不会被网页退出直接删除。浏览器再次登录复用同一账本。账号停用/删除后仍拒绝网页和外部 API Key。站长原生管理登录单独为 `/sign-in?admin=1`，本机管理助手已更新。

尚未填写任何真实模型上游或收款商户，因此当前没有真实模型可调用，也不能真实充值。支付参照用户截图的支付宝/微信、固定/自定义金额、订单二维码、到账和订单记录；截图实际链路为 `/epay/submit.php` → `cashier.haozpay.com`，但该平台的正式接口文档和自有商户资料仍需取得。不能把收银台网址直接填作商户网关，也不照搬与业务不符的“日用品/服装”等商品描述。详见 [收款配置](docs/payment-setup.md)。

普通域名公网 TLS 当前仍不能稳定直连。2026-10-18早先控制台显示未提交，用户随后反馈已自行提交企业ICP备案申请，现待审核（用户本次反馈，未核实官方审核结果）；不可仅根据TLS失败推定备案状态。原购买时长2个月不足条件，用户手动续费1个月后已查验到期2026-11-20T21:50:29Z（北京时间11月21日05:50）。本会话API续费曾因余额不足失败，未完成扣款，之后没有重复续费。

客户端内部页面及 Win AI 模型请求使用既有官方 IP CA 与证书指纹连接，不需要用户 SSH，也不关闭 TLS 验证。浏览器账号流程使用拥有者SOCKS和有效公开证书验收；该通道不分发普通用户。备案后仍需验收普通浏览器、第三方客户端及支付平台外部回调，不能以软件内成功代替。

独立 IP HTTPS 证书已签发并自动续期，测试端口8443仅服务器本机可验证，当前Windows直连仍重置；暂不作为对客稳定地址。证书位于 `/etc/win-ai/ip-tls`，未替换现有客户端固定的443证书。

## 管理与部署

本机双击 `打开WinAI管理后台.cmd`，管理员 WinAIAdmin，密码由本机 DPAPI 保存并在用户使用助手时复制。服务器凭据 `/etc/win-ai/admin.json`、service.env 和 identity.env 均 root-only，禁止写入源码或发布包。拥有者 SSH/SOCKS 助手只用于本机管理，不向普通用户分发 SSH 密钥。

当前升级从完整 tencent 仓库根目录执行 `python win-ai/scripts/deploy-identity.py`：先临时 PG schema 验证，再增量迁移、备份后端文件、配置只读网关身份查询和官方 OAuth、钱包、Nginx。失败恢复原后端/代理，不删除新增的空身份表或现有用户资料。只适用于当前已有行舟后端及0.1网关的授权服务器。

`deploy.py/install.sh/publish-site.sh` 是0.1基础安装归档流程；升级后的服务器禁止重新执行它们重置身份设置。0.2部署包保留0.1官方制品、最新 Win AI 文件及必需身份桥代码，按其中 UPGRADE.md 升级。恢复须先核对当前生产版本、备份、账号和订单状态，不能直接覆盖 SQLite。

## 验证和交接

统一身份设计 [docs/unified-login.md](docs/unified-login.md)，独立浏览器入口验收 [docs/verification-0.3.0.md](docs/verification-0.3.0.md)。客户端2.8.48修复内嵌登录交接并区分侧栏图标；站长入口仅单独告知拥有者，操作见 [站长指南](docs/owner-operations.md)。真实PG和浏览器流程使用独立测试用户，之后经原生正式安全证明删除测试账本和来源身份。没有真实充值或付费模型调用；用户自行完成了服务器续费。

Frontend design and development by New API contributors. [New API](https://github.com/QuantumNous/new-api) Copyright QuantumNous and contributors，AGPL-3.0。原始对应源码和许可证通过本站 `/source/` 提供，版本来源和哈希见 upstream.json。网关官方原程序未修改。
