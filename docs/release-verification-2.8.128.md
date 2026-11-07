# 2.8.128 验收（2026-11-07）

基线 2.8.127 ecafff1。用户反馈 Codex 导入后显示 low，导入界面没有思考强度选择，无法按需求修改。

- 原因：导入组件直接采用目录 defaultEffort，导入没有下拉框；旧的重复导入逻辑保留整个旧配置，无法通过重新导入修改档位。编辑路径已有选择与传递，本轮补齐导入与重复导入路径。
- 每行思考强度独立选择，选项来自该模型 efforts；默认优先已有配置，刷新保留支持的手选值。显式导入会更新已有配置的 reasoningEffort 与能力缓存，不改名称、默认接口或创建重复模型。
- 三宽 1280/1700/2232 实际 React/Playwright 验证：ultra 导入、刷新不重置、重新打开读取保存值、重复导入改 low、编辑保存 xhigh、模型能力变化回落到支持值通过。报告 output/codex-effort-128-ui.json，截图 output/playwright/codex-effort-import-128-*.png。
- 连接测试通过 requestText 把 low/medium/high/xhigh/max/ultra 原值传到 Codex，CLI 参数 model_reasoning_effort 与选择一致；未改动卡密或账号流程。
- 本会话独立复核了配置合并、持久化、默认模型不变、回包刷新与下拉框不误触勾选等边界。
- 最终全量测试、安装包及公开发布结果后续追加。
