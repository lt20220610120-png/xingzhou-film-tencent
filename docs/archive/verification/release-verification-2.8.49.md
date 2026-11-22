# 2.8.49 视频预览与下载验收

2026-10-18，基线为本机最新 2.8.48 源码 af13fbf 与远端更新清单合并后的 c1a4e0f；保留 Win AI 2.8.48 的全部既有功能。用户输入“2.4.48”，实际最新发布与源码为 2.8.48，截图为 2.8.47。

根因与修复：

- 用户本机已完成视频文件存在，抽查为可解码 H.264 High/yuv420p + AAC LC。旧 xzmedia 非标准协议无法正确处理 MP4 尾部元数据与后续读取；直接 file 播放成功、经旧协议播放 error4。改为 standard + 明确 local host，按 Range 返回 206、Content-Range、Content-Length，使用文件流并处理取消。无 host 的编码盘符被 Chromium URL safety check 拒绝，因此全部地址生成器、图片预览缓存和资料迁移一并更新，mediaSource 兼容旧记录。
- 新处理器继续限制资料目录，检查 realpath 防止符号链接越界；区分 HEAD、404、416 和取消请求。用户真实 30.048 秒视频通过新协议可播放且跳到 20 秒后继续前进，证据 output/probe-video-result.json；用户文件只读、未改写。
- GenerationResults 是图视生成与 StoryboardWorkbench 分镜共同的结果组件。MediaPreview 通过 body portal 避开页面变换/裁剪与悬浮助手遮挡，固定可见关闭，支持 Esc、背景退出、焦点恢复、加载/失败反馈、重试与下载。失败只回读原结果链接，不重新生成。
- media-export-file 抽出可测试函数，原文件字节复制，本地缺失且远端有效时恢复下载；取消保存不报成功，多图按 urls 索引处理。

验证证据：

- 先红后绿协议与下载专项覆盖 Range 尾读、区间、HEAD、越界、取消、文件丢失恢复和下载字节一致；迁移同时覆盖新旧格式。
- output/video-ui-2849.json 与 video-preview-2849.png、video-error-2849.png：真实 React/Edge 模拟接口，播放、拖动、下载回执、受 transform/overflow 影响的父容器、关闭按钮、Esc、背景、错误提示、图片、420px 窄窗口通过，截图已查看。
- electron/video-preview-smoke.cjs 使用随包的真实 H.264/AAC 三秒测试视频（尾部元数据，92149字节），验证实际 Electron 协议 Range206、播放时间前进/跳转、导出字节一致；不再以四字节假视频作为播放证明。开发隔离报告 output/video-dev-smoke-2849/report.json success=true。
- 独立只读复核指出的迁移无 host 与预先取消竞态均已修复并补断言。

最终 npm test：2218项通过、0失败（output/tests-2849-final.log），Vite构建与NSIS通过。实际安装包运行时 qa/packaged-smoke-2.8.49-1792329786344/report.json success=true，videoPreview Range206、三秒视频跳转后时间前进、ready4、下载字节一致，以及图片解码、Win AI、CSP、sandbox与无登录付费请求拒绝均通过。用户真实视频导出23740150字节，SHA256与只读原文件一致（output/video-real-download-2849.json）。已发布2.8.49：公开GitHub资产digest、HEAD200、双main签名清单一致；软件原更新逻辑验证2.8.47/48发现2.8.49，本版无重复更新，官方IP镜像Range65536/总长度通过。证据output/release-2849-public.json、output/storyboard2849-inapp-update-verification.json。安装包2.8.49，103731899字节，SHA256 f1b3f21f459e84fc85d24506639b54a645ccdeb1767aaecf9c0b1d474599eca5。功能提交91b8616，清单0ed3c72。未将历史域名公网线路问题冒充本次复测结果。不操作真实账号、不付费生成、不修改用户项目或视频文件。
