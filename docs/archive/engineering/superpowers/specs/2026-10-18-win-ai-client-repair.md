# Win AI 2.8.48 客户端修复与运营入口

用户已自行完成企业ICP备案申请并等待审核，停止继续编辑备案表单。用户确认实际只提供创作工具、私有项目协作、API调用，无公众短剧在线播放/公开分享功能。后续运营按真实业务及官方要求，不将备案通过等同全部AI/收费许可。

用户安装2.8.47后截图ERR_UNEXPECTED(-9) loading /api/win-ai/bootstrap，API接口与Win AI重复钥匙图标。实际已安装app.asar与当前panel/transport/main文件哈希一致，版本2.8.47；独立Electron复现能完成bootstrap303，安装环境失败尚不能简单归为网络或旧包。

修复交接边界：主进程使用既有固定CA/指纹传输完成一次性ticket POST并保存HttpOnlyCookie，只在浏览视图GET /api/win-ai/start，避免将携带票据的POST导航交给Chromium。严格检查303和固定同源start路径，释放响应流，任何异常清理私有session并给可读错误。继续原生OAuth state/单次码；不禁用TLS、不把来源token交renderer。

Win AI采用独立Network图标，API接口保留KeyRound。用户后续明确否决任何用户可见的站长入口；不在软件或网站用户UI增加管理按钮。独立管理员地址/sign-in?admin=1及本机打开助手，仅告知拥有者；站长仍使用独立WinAIAdmin凭据，普通账号不因知道URL获得权限。保留换号/停用/退出关闭及定时复核。

检查原生渠道、模型定价、用户、用量、任务、额度管理的真实路由和权限，提供运营指南及真实商户支付步骤。没有商户凭据/正式API文档/真实小额回调前不宣称收款开通。普通静态收款码不能冒充自动回调。保持已有价格和余额。

测试先失败再实现；实际Electron和隔离安装包界面验证，完整测试/build/release，发布2.8.48并核对签名清单/哈希、交接手册和软件更新记忆。网站0.3.0独立浏览器入口已部署，前序2213tests及浏览器验收通过，待与本次客户端改动一并收尾、提交和打包来源。

## 验证后的根因与结果

新增真实安装包模拟传输验证，准确复现相同ERR_UNEXPECTED(-9)。process.log显示Electron43.2 protocol.handle在构造Headers(preq.headers)时，默认User-Agent包含中文“行舟影视”（34892=行），违反Fetch ByteString而在handler之前失败。开发Electron英文UA未复现因此不能代表安装环境。只对Win AI随机Session设ASCII UA后，安装包同一测试通过。保留主进程交接检查及GET导航。

package-release原catch仅设exitCode，electron-builder的退出钩子会覆盖为0；独立复核复现这一行为，改为process.exit(1)，避免运行时失败还继续publish。首次失败后已停止发布进程，重新全量2215测试、build及安装运行时通过后才发布最终制品。
