# Gemini 网页协议参考说明

行舟影视的 `gemini-web.cjs` 是使用 Node.js、浏览器 DevTools Protocol 和浏览器内 `fetch` 编写的本地桥接。发行包不包含、不导入也不运行 `gemini-webapi`、`browser-cookie3` 或 Python 运行环境。

Gemini 网页接口的地址、请求字段、账号模型发现字段和流响应格式在实现过程中参考了 [HanaokaYuzu/Gemini-API](https://github.com/HanaokaYuzu/Gemini-API)（研究时发行版本 `gemini-webapi 2.1.1`）。该参考项目的 [LICENSE](https://github.com/HanaokaYuzu/Gemini-API/blob/master/LICENSE) 及该版本发行包所附许可证为 GNU Affero General Public License v3.0，不能将其标记为 MIT。

浏览器连接能力依据 [Microsoft Edge DevTools Protocol](https://learn.microsoft.com/en-us/microsoft-edge/devtools/protocol/) 和 [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)。登录发生在用户本机安装的普通浏览器、行舟影视独立资料目录中；浏览器和 Google 服务由各自提供方维护。

Gemini 网页协议属于非官方兼容接口，可能随 Google 网页更新而变化。模型列表取自实际登录账号，不代表额外购买或保证可用额度。
