# 内置无限画布

静态资源来自 [basketikun/infinite-canvas v0.20.0](https://github.com/basketikun/infinite-canvas/releases/tag/v0.20.0)，源码提交为 `3a6b64b602ad062b29fac66902ed18a7ef5fd9dc`，原作者及 MIT 许可见 [LICENSE](LICENSE)。

从行舟影视发布工作区运行 `python scripts/build-infinite-canvas.py`，可重新构建并核对已提交的静态文件。加 `--write` 可更新静态文件。脚本校验固定源码归档的 SHA-256，应用 [桌面补丁](../scripts/infinite-canvas-desktop.patch)，通过 Bun 1.3.13 使用上游冻结的 `web/bun.lock`，再以 `VITE_BASE=./` 构建 Web 端。宿主的下拉控件样式和脚本从本目录复制进构建，更新时保留原有文件。

桌面补丁在 `xzapp:` 下启用哈希路由，由内嵌页面向宿主回传当前路由。内嵌和独立窗口沿用 `xzapp://canvas`、原有 IndexedDB 和本地存储。版本查询参数用于更新静态页面缓存。Electron 按现有接口提供 `config.js`，将已配置的本机 Muse 渠道附加到已有配置。画布项目、资产文件和渠道配置随原用户目录读取。

运行 `npm run build` 后，在发布工作区执行 `node scripts/verify-infinite-canvas.cjs`。脚本用 2.8.211 随附的旧画布资源读取隔离测试资料，再在同一个 Electron 资料目录中读取新版画布并重启。它通过实际宿主画布入口和独立窗口校验路由、历史画布、图片、节点连线、渠道及 Muse，并检查宿主下拉控件、新版缩略图和聚焦、带参考连线复制、重生成偏好持久化及本地存储统计回退。
