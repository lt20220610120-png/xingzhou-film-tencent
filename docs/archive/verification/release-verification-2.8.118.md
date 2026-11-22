# 2.8.118 验收（2026-11-03）

基线acb45ab，用户要求重构整个运行进度，暂停随时可见，聊天对齐Codex/OpenFilm模式，输入框模型切换。追加明确保留行舟主要配色，未采用参考图深色。
从GitHub安装并读取nextlevelbuilder/ui-ux-pro-max-skill的.claude/skills/ui-ux-pro-max，安装位置C:/Users/11599/.codex/skills/ui-ux-pro-max。采用状态反馈、分区、固定控制和可访问性规则；未使用被禁止的frontend-design Skill。
本机OpenFilm前端CSS/JS及agents.mjs只读参考，未修改OpenFilm或用户制作数据。行舟自渲染对话，不声称嵌入官方桌面窗口。
ProductionRunWorkspace统一状态栏和双栏布局，左侧标签页、独立滚动，右侧输入框保持可见。原开工设置保留。
模型列表读取Codex支持的efforts/defaultEffort，选择后经validateAgentModel校验并存当前run；turn/start使用保存模型/effort，切换模型保持同一线程。Hermes仅显示已有模型，不虚构推理强度；补齐ACP工具/计划事件和消息分段。
对话按逻辑turn组织过程与最终回答，持久记录模型、时间和强度。独立复核修复保留尾部无用户消息时空白、steering回合归属、验证模型与开始回复竞争。
测试、UI截图、安装包与公开清单结果发布后补记。

最终全量2696/2696测试、生产构建通过；三宽1280/1700/2232UI检查通过，验证暂停状态/输入框可见、模型与强度切换、Hermes模型独立且无伪造强度、过程折叠与参数展开。截图output/playwright/workspace-28118-paused-1700.png、workspace-28118-model-1700.png、workspace-28118-hermes-1700.png。
安装包运行qa/packaged-smoke-2.8.118-1793636231982：success=true，errors=[]；源码fb07aae已推送main。
已公开发布：官方镜像脚本核验103989541字节，SHA256 d0a026032c62f71c1fa89bec2ea490261d71fddfff3592eba624699f97e4d919。
官方安装包 https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.118.exe 。本机release/2.8.118/Xingzhou-Film-Tencent-Setup-2.8.118.exe。
未执行付费生产、未修改用户制作任务，未安装替换当前客户端。当前版本新增的是行舟自身的Agent界面；没有嵌入Codex/Hermes官方桌面窗口。
公开三份latest.json均核验版本、安装包URL、大小、SHA256和Ed25519签名一致；GitHub uploaded资产size及官方sha256 digest与本地包一致。未以完整二次下载作为本轮证据。
