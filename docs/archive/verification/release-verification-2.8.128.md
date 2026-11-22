# 2.8.128 验收（2026-11-07）

基线 2.8.127 ecafff1。用户反馈 Codex 导入后显示 low，导入界面没有思考强度选择，无法按需求修改。

- 原因：导入组件直接采用目录 defaultEffort，导入没有下拉框；旧的重复导入逻辑保留整个旧配置，无法通过重新导入修改档位。编辑路径已有选择与传递，本轮补齐导入与重复导入路径。
- 每行思考强度独立选择，选项来自该模型 efforts；默认优先已有配置，刷新保留支持的手选值。显式导入会更新已有配置的 reasoningEffort 与能力缓存，不改名称、默认接口或创建重复模型。
- 三宽 1280/1700/2232 实际 React/Playwright 验证：ultra 导入、刷新不重置、重新打开读取保存值、重复导入改 low、编辑保存 xhigh、模型能力变化回落到支持值通过。报告 output/codex-effort-128-ui.json，截图 output/playwright/codex-effort-import-128-*.png。
- 连接测试通过 requestText 把 low/medium/high/xhigh/max/ultra 原值传到 Codex，CLI 参数 model_reasoning_effort 与选择一致；未改动卡密或账号流程。
- 本会话独立复核了配置合并、持久化、默认模型不变、回包刷新与下拉框不误触勾选等边界。
- 最终全量测试、安装包及公开发布结果后续追加。

## 最终验收与发布

- 2763/2763 全量测试、构建与安装包运行通过，运行报告 qa/packaged-smoke-2.8.128-1794039344853/report.json，success=true、errors=[]。
- 本机真实 gpt-6.1-sol / xhigh 返回“思考强度连接成功”，证据 output/codex-effort-128-real.json。
- 安装包104021149字节，SHA256 cb2e326a8749894db272b76fd0f12adb9767583933099336005e7cd8e8eebf0b；GitHub Release id437435011，asset uploaded，公开digest一致。官网正式文件全SHA256、公开Range206前65536字节、三份签名清单及客户端实际优先IP更新源均通过，证据output/effort-128/。
- 下载：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.128.exe 。本机 release/2.8.128/ 同名安装包。实现ee0adda已推送；没有替换当前运行客户端。
