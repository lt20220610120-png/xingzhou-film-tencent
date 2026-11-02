# 2.8.118 验收（2026-11-03）

基线acb45ab，用户要求重构整个运行进度，暂停随时可见，聊天对齐Codex/OpenFilm模式，输入框模型切换。追加明确保留行舟主要配色，未采用参考图深色。
从GitHub安装并读取nextlevelbuilder/ui-ux-pro-max-skill的.claude/skills/ui-ux-pro-max，安装位置C:/Users/11599/.codex/skills/ui-ux-pro-max。采用状态反馈、分区、固定控制和可访问性规则；未使用被禁止的frontend-design Skill。
本机OpenFilm前端CSS/JS及agents.mjs只读参考，未修改OpenFilm或用户制作数据。行舟自渲染对话，不声称嵌入官方桌面窗口。
ProductionRunWorkspace统一状态栏和双栏布局，左侧标签页、独立滚动，右侧输入框保持可见。原开工设置保留。
模型列表读取Codex支持的efforts/defaultEffort，选择后经validateAgentModel校验并存当前run；turn/start使用保存模型/effort，切换模型保持同一线程。Hermes仅显示已有模型，不虚构推理强度；补齐ACP工具/计划事件和消息分段。
对话按逻辑turn组织过程与最终回答，持久记录模型、时间和强度。独立复核修复保留尾部无用户消息时空白、steering回合归属、验证模型与开始回复竞争。
测试、UI截图、安装包与公开清单结果发布后补记。
