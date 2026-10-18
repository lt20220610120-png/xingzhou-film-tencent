# Win AI 0.2.1

基于 QuantumNous/new-api 官方 v1.0.0-rc.45 原程序的自有中转站。站点品牌、首页、接口文档和钱包属于 Win AI，账号身份由行舟影视管理。

- 网站：https://winai.xingzhoufilm.cn/
- 控制台：https://winai.xingzhoufilm.cn/dashboard/overview
- API：https://winai.xingzhoufilm.cn/v1
- 接口文档：https://winai.xingzhoufilm.cn/docs
- 收款步骤：https://winai.xingzhoufilm.cn/payment-setup
- 行舟客户端：2.8.47，左侧 Win AI 自动使用当前账号，无需再次注册。

## 使用和运营

普通用户从行舟影视进入；控制台提供令牌、模型、用量、钱包和订单。源码未复制上游密码；网关以行舟 UUID 独立记账，新用户零额度、普通角色。退出或换号关闭页面，来源账号停用后拒绝网页和外部 API Key。密码注册关闭，OAuth 按需创建对应账本身份。独立网站当前的“行舟影视”登录入口需要从软件交接身份，未实现独立网页的行舟密码登录表单。

尚未填写任何真实模型上游或收款商户，因此当前没有真实模型可调用，也不能真实充值。支付参照用户截图的支付宝/微信、固定/自定义金额、订单二维码、到账和订单记录；截图实际链路为 `/epay/submit.php` → `cashier.haozpay.com`，但该平台的正式接口文档和自有商户资料仍需取得。不能把收银台网址直接填作商户网关，也不照搬与业务不符的“日用品/服装”等商品描述。详见 [收款配置](docs/payment-setup.md)。

普通域名公网 TLS 当前线路不稳定。客户端内部页面及 Win AI 模型请求使用既有官方 IP CA 与证书指纹连接，不需要用户 SSH，也不关闭 TLS 验证。普通第三方客户端与外部支付平台的公网可达性仍需跨网络验收，不能以软件内成功代替。

独立 IP HTTPS 证书已签发并自动续期，测试端口8443仅服务器本机可验证，当前Windows直连仍重置；暂不作为对客稳定地址。证书位于 `/etc/win-ai/ip-tls`，未替换现有客户端固定的443证书。

## 管理与部署

本机双击 `打开WinAI管理后台.cmd`，管理员 WinAIAdmin，密码由本机 DPAPI 保存并在用户使用助手时复制。服务器凭据 `/etc/win-ai/admin.json`、service.env 和 identity.env 均 root-only，禁止写入源码或发布包。拥有者 SSH/SOCKS 助手只用于本机管理，不向普通用户分发 SSH 密钥。

当前升级从完整 tencent 仓库根目录执行 `python win-ai/scripts/deploy-identity.py`：先临时 PG schema 验证，再增量迁移、备份后端文件、配置只读网关身份查询和官方 OAuth、钱包、Nginx。失败恢复原后端/代理，不删除新增的空身份表或现有用户资料。只适用于当前已有行舟后端及0.1网关的授权服务器。

`deploy.py/install.sh/publish-site.sh` 是0.1基础安装归档流程；升级后的服务器禁止重新执行它们重置身份设置。0.2部署包保留0.1官方制品、最新 Win AI 文件及必需身份桥代码，按其中 UPGRADE.md 升级。恢复须先核对当前生产版本、备份、账号和订单状态，不能直接覆盖 SQLite。

## 验证和交接

统一身份设计 [docs/unified-login.md](docs/unified-login.md)，当前验收 [docs/verification-0.2.1.md](docs/verification-0.2.1.md)。真实 PG 临时 schema、实际 SQLite 分类器、软件内免注册/重复进入/换号/钱包刷新验证均使用独立测试用户；回调和上游付费测试仅在网络隔离、临时数据库中进行。没有真实扣款或真实付费模型调用。

Frontend design and development by New API contributors. [New API](https://github.com/QuantumNous/new-api) Copyright QuantumNous and contributors，AGPL-3.0。原始对应源码和许可证通过本站 `/source/` 提供，版本来源和哈希见 upstream.json。网关官方原程序未修改。
