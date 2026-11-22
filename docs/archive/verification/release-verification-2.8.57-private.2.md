# 2.8.57-private.2 验收记录

2026-10-21。来源：用户实际 private.1 截图，指出白底浅字、打开后无法退出、409 条提示词逐条确认过于复杂，要求 AI 干活并恢复原编辑方式。原本机试用限制继续有效。

## 根因及修正

1. `studio-theme.css` 的 `input:not(...)` 规则以更高优先级设白底，而关联面板保留浅色文字。前版测试夹具没载入 studio/brand/readability 主题，漏掉实际组合。此次夹具加载这些主题，输入框同时明确背景、前景、caret、text-fill；面板改为浅色，文字对比度 12.52。
2. 原流程只有 review/generation，没有 manual 返回状态；未确认无法进入 generation。新增 manual 状态和顶部粘性返回按钮，立即退出并停止异步任务，保留原稿、素材、编辑和 AI 进度；晚到结果被拒绝。已发布确认快照撤销后，原模式无需通过联动确认才能编辑。
3. 原整本函数依赖逐场身份确认，且结果仍须逐条确认。新增 `core/importedArtAuto.js`，身份按场景/图片批次处理，同一图本轮只处理一次；身份完成后再计算逐条签名，避免共享图片晚变动使已处理条目过期。明确判断经类型/引用/原文完整性校验后自动就绪，不能确定的条目保留问题。保存每段进度，未变的已完成条目不重跑。只调用 AI，不调用视频提交。
4. 名称匹配把任意 `人物名-后缀` 截成前缀，旧无类别杯子/文件夹被误认人物。先用回归测试复现，再限制为明确角色类别或已知妆造后缀。保留已存在手工引用，不将旧稿自动重写当作修复。

## 验证

- 全量 2318/2318，通过，0 失败：主目录 `output/association-simple-tests.log`。
- 聚焦 38/38：`output/association-simple-focused.log`。自动贯通、退出保留、确定/不确定、断点恢复、停止晚到结果、类型约束、原联动与旧匹配回归。
- 真实 React / Edge 1280、1700、2232：`qa/imported-art-simple-ui.cjs`，主目录 `output/imported-art-simple-ui.json`。默认面板 <650px；真实主题输入框对比度 12.52；无逐条点击完成两条并单独保留一条缺图；生成引用精确；返回恢复、刷新恢复、异步任务中退出后晚回包不复活。0 页面错误，无横向溢出。
- 手动详情兼容两宽复验：`qa/imported-art-binding-ui.cjs`，`output/imported-art-ui-verification.json`。看图请求、人工确认、重新载入、返回修改再确认及账号隔离通过。
- 截图 `output/imported-art-simple-{width}.png`、`output/imported-art-readable-{width}.png` 已查看。
- 生产构建日志 `output/association-simple-build.log`，既有体积提示保留。最终打包和运行证据 `output/association-simple-package.log`，结果在交付前追加。

## 边界

AI 判断明确不等于真实语义绝对正确；仍保留待处理和人工调整。看图需支持图片输入的 API，现有本机 Codex 文字桥接保持原范围。没有使用真实付费生成测试，没有代用户处理当前 409 条，没有修改真实项目或关闭正在使用的软件。用户安装后自行启动 AI 处理。

## 最终安装包

- NSIS 打包和实际 Electron 运行校验 PASS，版本 2.8.57-private.2，promptArtTrial=true、importedBindingBridge=true，errors=[]。
- 运行报告：qa/packaged-smoke-2.8.57-private.2-1792523341007；完整日志：主目录 output/association-simple-package.log。
- ASAR 内 importedArtAuto.js / automaticReferences.js 与最终源码逐字节一致，package.json 版本匹配。
- 交付路径：C:/Users/11599/Documents/ChatGPT/行舟影视/tencent/release/2.8.57-private.2/Xingzhou-Film-Tencent-Setup-2.8.57-private.2.exe。
- 大小 103812233 字节；SHA256 3dd4ec736c4069c18dfb4eac2d13babc092eb08e6fb88b2fd56f61b786038801。
- 未上传公开 Release，未修改公共更新清单；运行中的用户客户端等待用户关闭后安装。
