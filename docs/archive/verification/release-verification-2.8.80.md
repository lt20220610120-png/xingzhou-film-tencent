# 2.8.80 发布验收

日期：2026-10-27。来源：用户八张截图与模型并发链路、批量提示词核实发布要求。基线 2.8.79。

## 实现与边界

- `artAnalysisPipeline` 在用户点击分析后运行，不依赖提示词面板挂载。库存读取保持连续性上下文；场景关联 2 路、详情批次 2 路；各节点完成即派发下游，提示词自动 4 路、手动保留 2 路。保存仅短时串行，按条目决策校验并发冲突，不用全项目 revision 变化拒绝不相关结果。
- `artReviewRunner` 复用 `inventoryOnly` 阶段，场景和详情独立；7 张卡片分成两批时，第一批的已就绪场景立即启动提示词，无需等待第二批。原待补三次、后文回填、人工关联和账号权限沿用。
- `promptDistributionService` 仅接受显式分析或手动操作；每次自动分发调用现有 aiChat，输入完整提示词、基础设定索引及本场权威清单。只接受模型 assignments/missing，验证卡片、类别和原文，保留人工锁定；不保存程序猜测。界面只展示保存结果，空清单显示等待上游。
- 分发按账号/项目/条目防重，持久化领取记录，其他条目回包可合并；同条人工修改、正文版本变化、停止后排队的最终保存会拒绝旧结果。仅收到但格式不合格的模型回包最多三次修正；网络错误不盲目重发。旧外窗 running 领取在10分钟内保留防重保护。
- `promptReviewBatch` 按所选版本做整场、本集、全剧人审核实及发布，分发结果有效、人审和发布状态分别保存在版本记录。模型完成不自动发布；发布沿用核实账本/API及图片保护。空/无效原始提示词不会因被快照过滤而漏过门禁；typed invalidEntries 只阻止所属范围。
- 信息读取与维护任务按实际活跃分集防重；不同分集可同时处理。分镜和图视生成沿用已有联动及权限门禁；默认人物构图并入批量模型前方。

## 验证

- `npm run dist`：**2442/2442 通过**，Vite生产构建、NSIS、实际安装包运行时 PASS。日志 `output/dist-2880.log`。
- 核心新回归：并发读集/场景/提示词重叠、详情单批完成即时触发、同条复用、不相关回包合并、人工修改和来源变化拒绝、跨窗口CAS重试、独立手动通道、三次修正上限、停止领取及最终保存、空/缺项门禁、跨场空提示词不阻塞已完成场、人审发布范围与图片生成后人审延续。
- `verify-model-pipeline-ui.cjs`：1280/1700/2232宽度使用实际React组件和完整生产CSS，分析前0请求；挂起自动任务期间手动本条立即调用（模拟峰值5请求），其他已空闲分集按钮可用；本场2条、本集3条、全剧6条依次正确核实发布，美术显示提示词及所属场景，构图与模型同栏。0真实模型/生图/视频付费调用。
- 原素材消费者四宽回归通过：卡片84px等宽等高，美术关联及分镜11图/3图子集、保存原文、模拟提交精确素材。独立导入图视生成两宽回归通过。
- 独立只读复核发现3项边界问题（空提示词遗漏、详情批次触发滞后、停止后保存）；均先复现失败，修复后独立复验通过，相关15项核心测试通过，再重新完整打包。
- UI证据 `output/playwright/model-pipeline-2880.json`、`prompt-consumers-2880.json` 和对应截图。
- 安装包 `release/2.8.80/Xingzhou-Film-Tencent-Setup-2.8.80.exe`，103851253字节，SHA256 `8dbdf19ad4c079bf8cd1f779cc65de5a29660274a0069070308e0d09a913862c`。

## 发布

已正式发布。实现源码提交 `b4690c8`，安装包同步 GitHub Release 与官方 HTTPS 镜像；两处 GitHub main 与官网三份 latest.json 完全一致，Ed25519 签名通过。GitHub 资产大小及 digest 与本机一致，镜像发布端完整 SHA256 和大小核验通过，公开 Range 请求返回 206、正确 MZ 头及总大小。证据 `output/publish-2880.log`、`output/playwright/public-release-2880.json`。

- 官方安装包：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.80.exe
- GitHub 安装包：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.80/Xingzhou-Film-Tencent-Setup-2.8.80.exe
- 本机安装包：C:/Users/11599/Documents/ChatGPT/行舟影视/tencent/release/2.8.80/Xingzhou-Film-Tencent-Setup-2.8.80.exe
