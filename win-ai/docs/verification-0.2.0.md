# Win AI 0.2.0 / 行舟影视2.8.46 验收（2026-10-18）

基线：Win AI0.1.0提交d8b9e8b、客户端2.8.45；工作分支codex/win-ai-unified-login-2.8.46。保留既有未跟踪 docs/security-rating-2.8.4.md 和output，未使用真实用户项目或真实支付做测试。

## 已通过

- 客户端 npm test：2203项全部通过，0失败；npm run build通过。独立制作2.8.46安装包并完成安装后运行时验证，包含DOCX/本地媒体/IPC/CSP/沙盒、原工作台启动，不读取正常用户数据。
- 实际SQLite分类器：路径相关Claude/Gemini/API Key、WebSocket subprotocol、Midjourney、JWT、refresh、PAT及legacy PAT；Go查询首个空值/非法百分号/分号行为；充值与订阅订单金额严格比较。
- 实际PostgreSQL临时schema：迁移重放、错误证明不消耗票据、一次性消费、会话删除级联、永久身份绑定及来源删除失效。生产只新增3张身份表，运行账号只获这些表的DML权限。
- 实际Electron与生产服务的临时QA用户：无需第二次注册进入、普通角色1/初始额度0、重复进入同一账本身份、换号得到另一身份；钱包完整显示CNY余额、未启用真实收款说明，页面刷新保留会话。使用内置固定CA/指纹连接，不用SSH，不关闭TLS验证。原生capturePage在当前Windows环境不可用，未用失败截图宣称视觉通过。
- 构建后的React UI在真实Chrome中：普通用户能看到左侧Win AI，栏目标题和账号、native显示区域坐标正确，离开触发关闭，无页面异常。此项native IPC为mock；真实OAuth由上一项单独验证。
- 真实Chrome经拥有者SSH/SOCKS：Win AI首页/文档/复制、390/768/1440无溢出、管理员登录/概览/渠道/令牌/用户与刷新、钱包的收款未启用状态、收款指南；setup状态GET可读而修改与密码注册403，无未捕获页面错误。该项不证明普通公网线路可用。
- 隔离网络、临时New API数据库：本地假上游非流式/SSE、独立令牌、上游密钥替换与错误令牌；充值待支付订单、错误签名、有效签名但金额不符均拒绝，正确通知入账、重复通知不重复加款、订单记录。真实付费调用与扣款均0。
- 易支付订阅回调同样经过订单金额核对；浏览器return只跳回钱包，不能靠返回页面直接激活套餐。订阅真实商户交易未验证。
- 软件内Win AI API专用传输保持独立API Key、请求体、取消信号及SSE，无网页登录Cookie；其他供应商继续原fetch。TLS并发静态资源传输实测全部200，gzip解压保证完整响应。
- 独立复核发现的凭据优先级、遗漏PAT/subprotocol/Midjourney、重复query空值问题均已修复并补实际分类器回归。最后补审因独立审阅工具额度耗尽中止；新增支付金额层和最终传输改动由当前会话自查、单元/隔离/实机验证，不宣称其已获完整独立终审。

## 发布与当前边界

客户端2.8.46安装包：103635741字节，SHA256 `9f78f1e98d804cea263903ebad93a2f26ac36dfd577fa8243f0e63ed03d7c4e5`。GitHub release、两处latest.json与官方镜像已发布；公开清单另做签名/哈希对比。

Win AI0.2部署包见output/win-ai-release-0.2.0.json，包中保留官方制品、源码、许可证和本次增量；没有凭据、SSH key或DPAPI缓存。0.1基础部署脚本为归档，不可重新运行重置当前身份设置。

尚无真实上游及支付商户。模板站长声明未代替用户确认，真实收款关闭；普通收款码不能直接自动到账。参考截图确认的外部收银台域名为cashier.haozpay.com，未取得其正式文档和自己的商户账户，不声称平台兼容、资质或实际到账已验收。

普通域名TLS及测试IP8443在当前Windows直连仍重置。IP短期公开证书已成功签发、独立certbot5.4及每6小时续期timer就绪，未替换旧443客户端固定证书；8443服务器本机通过不代表对客网络通过。网站面向第三方客户端和外部支付回调仍需跨网络验证。

主要证据：output/win-ai-2846-tests-final.log、build/package/publish.log、win-ai-sso-result*.json、win-ai-navigation-result.json、win-ai-browser/result.json、隔离测试输出；QA生命周期追加及清理结果另存output，不将未通过的重试记录冒充通过。压力式反复登录曾命中原生429限制，保留限制未全局放宽。

## 最终追加记录

实际临时用户生命周期测试通过：创建独立API令牌后GET模型列表200，停用来源行舟用户并级联删除会话后，该令牌、带空首值重复query的请求及原生网页JWT均403。两名原生测试用户通过站长密码的官方安全验证证明后删除，两名来源测试用户删除；没有修改真实用户行。证据output/win-ai-sso-result.json与win-ai-qa-cleanup.json。

两处公开latest.json均为2.8.46且通过随包Ed25519公钥验证；GitHub资产digest、安装包本机SHA256和大小、更新清单完全一致。服务器官方镜像发布脚本亦校验同一制品。
