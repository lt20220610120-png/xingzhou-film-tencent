# 内置无限画布

本目录基于 [basketikun/infinite-canvas v0.19.0](https://github.com/basketikun/infinite-canvas/releases/tag/v0.19.0)，源码提交 `e856c878e0a34651bb828e28f0af20d71016a7d4`。构建前在上游 `web/src/router.tsx` 同时导入 `createHashRouter`，将原来的路由数组赋给 `routes`，并设置 `window.location.protocol === "xzapp:" ? createHashRouter(routes) : createBrowserRouter(routes)`，使桌面内嵌地址使用 HashRouter；再于 `web/` 执行 `VITE_BASE=./ npm run build`，复制 `web/dist/` 的静态文件。原项目的 MIT 许可见 [LICENSE](LICENSE)。

行舟影视仅在 `index.html` 保留路由回传脚本，使内嵌画布切换画布时，宿主应用能记住上次页面。画布始终通过 `xzapp://canvas/` 加载，以延续已有浏览器本地存储；宿主入口附带版本查询参数以避免更新后继续使用缓存的旧页面。更新画布时，不修改这个协议和主机名，也不要清除用户的站点数据。
