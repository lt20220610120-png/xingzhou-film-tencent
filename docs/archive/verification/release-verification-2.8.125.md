# 2.8.125 验收（2026-11-04）

- 基线为 2.8.124（`7257178`）。新增 Topaz GUI 工程生成、UI Automation 驱动和独立 runner，正式任务与连接测试共用同一入口。
- 当前电脑现有 Topaz 1.1.2 修改版已在 4 倍真实测试中完成 256×256 → 1024×1024 出片，1 秒输出保留 AAC 48 kHz 音轨，帧率 24 fps，元数据为 `Enhanced using prob-4`。
- 2.8.125 再通过 `createProductionHost.post` 正式入口完成 2 倍真机验收：256×256 → 512×512，保留音轨，`engine=Proteus`、`transport=gui`，原片 SHA256 未变。报告：`output/125-topaz-final-probes/report.json`。
- 运行中停止探针在 Topaz 已开始写 MP4 后执行项目停止。最终 Topaz 进程剩余 0，最终视频、验收凭据和未验收半成品均不存在，原片 SHA256 未变。
- Topaz 驱动在异常和正常结束时不再依赖可能失效的项目断言来关闭进程；窗口锁定无论成功失败都会解除。Runner 在失败或取消时删除未验收输出。
- 三宽界面实测 1280/1700/2232：2/4 倍选择传入测试配置；测试开始后独立“停止Topaz测试”按钮可见可点，点击后按钮恢复并按正常取消提示结束。
- 全量测试与生产构建结果在发布提交前再次执行；安装包大小、SHA256、公开清单和官网下载在本文件末尾追加。

## 安装包

- 文件：`release/2.8.125/Xingzhou-Film-Tencent-Setup-2.8.125.exe`
- 大小：`103958417` 字节
- SHA256：`C05D6C1E6913919AB9E68E11C502899B4B232F2E87D0405557C2E4C8987CED90`
- 安装包运行时烟测：`success=true`、`errors=[]`，报告位于 `qa/packaged-smoke-2.8.125-1793731730615/report.json`
- ASAR 已确认包含 `electron/topaz-gui-driver.ps1`、`electron/topaz-gui-project.cjs`、`electron/topaz-gui-template.json`、`electron/topaz-gui.cjs`。

## 公开发布

- GitHub Release：`https://github.com/lt20220610120-png/xingzhou-film-updates/releases/tag/v2.8.125`（release id `433097553`）。
- GitHub 安装包：`https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.125/Xingzhou-Film-Tencent-Setup-2.8.125.exe`。
- 官网安装包：`https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.125.exe`。
- 官网、`xingzhou-film-updates` 和 `xingzhou-film-tencent` 三份 `latest.json` 均通过 Ed25519 签名、版本、下载地址、大小与 SHA256 一致性校验。
- GitHub 资产状态为 `uploaded`，API digest 与本地 SHA256 一致；GitHub 与官网 Range 206 前缀下载均与本地安装包逐字节一致。
