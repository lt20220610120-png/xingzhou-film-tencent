# 行舟影视 2.8.107 验收（2026-11-01）

## 问题与修复

- 用户截图中备用 1、备用 2 的分辨率均只有 720p。根因是 `mediaModelChoices` 只保留接口当前选中项的 `capabilities`，备用模型再次解析时被该接口级参数覆盖。
- 模型选项现在携带每个具体模型的能力。真实本机配置核验：备用 1「特价渠道 Seedance 2.5 满血 1080p」显示 1080p，备用 2「特价渠道 Seedance 2.5 满血 720p」显示 720p；不虚增模型未声明的分辨率。
- 主模型、备用模型独立画幅、时长、分辨率、并发、尝试次数及后续提交逻辑保持原有规则。

## 验证证据

- 新增 `core/model-choice-capabilities.test.js`：同一接口当前模型 720p、备用模型 1080p。旧代码实测失败（实际 720p、预期 1080p），修复后通过，同时核验分辨率时长映射。
- `scripts/verify-fallback-video-ui.cjs` 使用同接口双模型夹具，1280、1700、2232 三宽实际下拉选择 1080p，验证保存、开工检查、排序及暂停后修改；无付费生成。
- `npm test`：2630/2630 通过，0 失败；提交前再次完整运行通过。
- `npm run build`：Vite 生产构建通过。
- 安装包运行时验收：`qa/packaged-smoke-2.8.107-1793525998130/report.json` 中 `success: true`、`errors: []`。
- 实现提交：`72b30c9`。全部模型请求均为模拟接口，未执行付费生成。

## 发布与本机安装

- 安装包：`release/2.8.107/Xingzhou-Film-Tencent-Setup-2.8.107.exe`，103953356 字节，SHA256 `93023f64b2256ab09c6cf7a41d1740cff294198d3122dfe5514fb0adbaf29187`。
- GitHub Release `v2.8.107` 已发布；资产大小与 `digest` 和本地安装包一致。
- 官网及两个 GitHub 公开 `latest.json` 均为 2.8.107，原始清单内容与本地一致，三份 Ed25519 签名全部通过；官网安装包 Range 请求返回 206，前 65536 字节与本地一致。
- 官网下载：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.107.exe
- GitHub 下载：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.107/Xingzhou-Film-Tencent-Setup-2.8.107.exe
- 已使用 `/S /CURRENTUSER /D=D:\行舟影视客户端\Xingzhou Film Tencent Edition` 安装，NSIS 退出码 0。D 盘主程序 ProductVersion 为 `2.8.107.0`，验证包中的 128 个应用文件全部逐一哈希一致；安装目录仅有卸载程序及图标两个预期附加文件。已打开的旧窗口需重启后使用新版本。
