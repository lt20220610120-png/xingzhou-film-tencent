# 2.8.57-private.1 验收记录

日期：2026-10-21。用户要求：已有提示词和图片先独立关联，由内部 Agent 配合，之后汇合至图视生成；经验用于后续美术联动/自动化。沿用本会话明确的本机试用范围，不公开 Release，不改公共 latest.json。

## 实现与隔离

- 独立分支 `codex/imported-art-binding`，工作目录 `tencent/.worktrees/imported-art-binding`。开始时主目录有 Like 连接修改，故隔离开发；之后合入已完成的 2.8.56 代码与文档 `d14e7df`。没有覆盖主目录其他工作。
- `core/importedArtBinding.js` 把已有 PromptBook 与本机图片转为统一关联快照，复用 `core/promptArtBinding.js`。保留集/场/条目身份、类别、具体图片、原文依据、人工锁定、未完成条目。
- `ImportedArtBindingPanel.jsx` 提供独立整理页，支持身份识别、文字/可选图片核对、本条/整本关联、停止、有限答案修正、人工确认及交付生成。
- `PromptBookWorkspace.jsx` 增加入口、账号过滤、已确认记录载入和返回修改时撤销旧快照。原导入路径保留。
- 主进程在生成前重新加载账号隔离的确认快照并重新编译；`imported-binding-media.cjs` 验证实际路径/文件哈希。预览缩略图仅来自导入媒体目录。
- AI 建议与最终选择保存到项目，确认记录存在原 `prompt-art-bindings`。无数据库迁移，无真实项目变更，无付费请求。
- `scripts/test.cjs` 使用相对于已固定 cwd 的套件路径，解决深层工作树在 Windows 中绝对路径参数总长度超限。

## 验证证据

- 全量 `npm test`：最终源码再次运行 2313/2313，通过，0 失败。日志主目录 `output/imported-art-tests-release.log`，先前同结果为 `output/imported-art-tests-final.log`。首次运行工作树缺少云端 `pg`、`sharp` 依赖，建立到现有依赖目录的 Junction 后复验通过；未把环境问题当成功。
- 聚焦：25/25，`output/imported-art-focused-final.log`。原清单联动与新导入关联、实际本地文件哈希、旧导入回归。
- 实际 React / Edge：1280、1700，两宽验证。`qa/imported-art-binding-ui.cjs`，输出主目录 `output/imported-art-ui-verification.json`。验证整本导入、AI 错误答案有限修正、看图输入、分别提交人物/场景与额外道具、未完成条目阻止、重新加载恢复、返回修改撤销旧记录、重确认和账号隔离。无页面错误，无横向溢出。截图为模拟素材卡片，已人工查看。
- 生产构建：`output/imported-art-build-final.log`。保留现有大包体积提示。
- 打包及运行证据在 `output/imported-art-package.log`；实际运行 `qa/packaged-smoke-2.8.57-private.1-1792522152776/report.json` success=true、promptArtTrial=true、importedBindingBridge=true。主进程/核心关联/预加载/图片验证模块与 ASAR 内容逐字一致；私有清单开关验证通过。

## 私人交付

- 安装包：`C:/Users/11599/Documents/ChatGPT/行舟影视/tencent/release/2.8.57-private.1/Xingzhou-Film-Tencent-Setup-2.8.57-private.1.exe`。
- 大小：103804910 字节。
- SHA256：`9a40b75977344bd1e92c156ce42bb9701ddec23d12b6266754447a31b0670e50`。
- 独立工作树中保留打包源和运行报告；安装包复制到常规 release 目录以便用户安装。没有上传公共安装包、没有更改正式 2.8.56 更新通道、没有安装替换用户正在运行的软件。

## 准确性边界

验证证明工作流和校验按预期执行，不等于真实 AI 对所有剧目都准确。当前已有本机 Codex 桥接只能文字处理；看图限支持图片的 Chat Completions API，不能宣称 Codex 已看图。没有对实际用户素材执行付费 AI/视频生成，没有实测服务商对参考图的服从程度。

确认记录是可用于评估的历史，不是跨项目自动学习系统。没有新增全自动生成/下载/超分/剪辑。本机安装包制作不代表用户当前运行实例已更新。
