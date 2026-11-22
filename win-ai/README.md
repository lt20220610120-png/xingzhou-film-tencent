# Win AI

Win AI 基于 QuantumNous/New API 的官方程序，提供独立中转站、控制台、接口文档和钱包。行舟负责账号身份。当前上游版本和哈希见 [upstream.json](upstream.json)。

- [站点](https://winai.xingzhoufilm.cn/)
- [控制台](https://winai.xingzhoufilm.cn/dashboard/overview)
- [接口文档](https://winai.xingzhoufilm.cn/docs)
- [收款配置](docs/payment-setup.md)

## 账号与部署

行舟桌面客户端从左侧 Win AI 使用当前账号完成登录交接。浏览器用户通过网站登录、注册或恢复，新注册账号须单独申请行舟权限。来源身份令牌留在服务端，网页登录使用 Secure HttpOnly Cookie，停用账号后拒绝网页与外部 API Key 请求。设计见[统一登录](docs/unified-login.md)。

现有授权部署使用 [deploy-identity.py](scripts/deploy-identity.py) 维护身份桥。脚本先用隔离 PostgreSQL 验证迁移，再备份现有身份服务和代理配置。Nginx 使用 Win AI 的 `conf.d` 配置。网关配置与管理凭据由服务器维护，恢复时先核对生产版本、备份、账号和订单状态。管理步骤见[站长指南](docs/owner-operations.md)。

历史浏览器验证见[0.3.0 验收](../docs/archive/verification-history/win-ai/docs/verification-0.3.0.md)。支付回调、真实上游和桌面内嵌交接分别验收。

Frontend design and development by New API contributors. [New API](https://github.com/QuantumNous/new-api) Copyright QuantumNous and contributors，AGPL-3.0。原始对应源码和许可证通过本站 `/source/` 提供。
