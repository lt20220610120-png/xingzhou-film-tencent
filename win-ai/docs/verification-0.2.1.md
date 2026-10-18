# Win AI0.2.1 / 行舟影视2.8.47 最终验收

2026-10-18。沿用0.2.0的统一身份与原生New API v1.0.0-rc.45程序；最终客户端为2.8.47，0.2.0和2.8.46保留为先前发布记录。

- 客户端2204项测试全部通过、0失败；Vite构建通过，安装包运行时验证通过。新增身份失效/权限更新时的明确重连通知，避免安全会话关闭后空白。
- 最新构建Chrome界面验证：普通用户导航、native显示区域、账号提示、失效提示与重新连接、离开关闭，无未捕获异常。IPC为mock，真实远程身份链路单独验收。
- 真实Electron+生产临时账号已通过免二次注册、重复进入保持同一账本、换号隔离、钱包刷新；普通角色1、初始额度0。创建的实际测试API Key读模型列表200；来源停用后令牌、重复空query覆盖尝试及网页JWT均403。两名原生测试用户经官方站长密码安全证明删除，两名来源测试用户删除，真实用户数据修改0。
- 真实SQLite分类器覆盖JWT/refresh/PAT/legacy/relay、Claude/Gemini/WebSocket/Midjourney优先级、Go查询空首值/无效百分号/分号、重复Cookie首个合法值及无效Cookie跳过。
- Nginx在guard和native入口将重复凭据头规范为一致值，防止“guard检查第二份、native接受第一份”。使用生产规范化指令、临时真实Nginx与固定版New API实测：单一有效密钥200，重复/歧义x-api-key无论顺序均401；无真实模型调用。
- 隔离支付测试通过：待支付订单、错误签名和有效签名但金额错误拒绝、成功回调只入账一次、订单记录。易支付订阅回调同样核对金额，浏览器return不直接加款/激活。没有生产测试充值或实际支付。
- 真实Chrome经拥有者SOCKS验证首页、文档、复制、移动宽度、管理员页面/会话、钱包与收款指南，无页面异常。该浏览器通道不作为客户接入方案；软件内另使用固定CA/指纹，无用户SSH，不禁用TLS。
- 两处公开2.8.47更新清单均通过公钥验签，与GitHub资产digest及本机文件的大小/哈希一致；官方镜像亦校验同一制品。

安装包103629227字节；SHA256 `b74930dcca07c528620a1d6538b1f3ebb699dc6e8ea39e6793d5128d64751dc1`。公开下载：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.47/Xingzhou-Film-Tencent-Setup-2.8.47.exe 。

独立复核曾完成凭据优先级、PAT/subprotocol与重复query问题复核，均已修复；后续独立终审因审阅工具额度耗尽中止，最终重复头/Cookie、传输、支付金额层由当前会话自查及上述测试验证，不宣称获完整独立终审。

正式收费仍未开通：没有真实商户资料、上游和模型售价配置，未代站长确认模板声明；普通公网域名和试验IP8443线路仍需跨网络复测，支付平台外部回调未实测。不能把个人收款码当自动订单回调，也不复制日用品/服装等不符交易描述。参考收银台cashier.haozpay.com的正式接口文档和自有商户账号仍需取得。

证据：output/win-ai-2847-release.log、win-ai-public-release-2.8.47.json、win-ai-navigation-result.json、win-ai-sso-result.json、win-ai-qa-cleanup.json、win-ai-browser/result.json，及隔离支付/头规范化测试输出。较早流程见verification-0.2.0.md。
