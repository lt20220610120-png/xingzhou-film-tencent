# 导演自动分段第一阶段 Implementation Plan

> **For agentic workers:** 使用 `superpowers:executing-plans` 逐项执行；仅在用户或适用指引明确选择并行代理时使用 `superpowers:subagent-driven-development`。本次交接已指定换模型后执行，不再询问执行方式。步骤以复选框跟踪。

**Goal:** 在导演快速模式完成可恢复的单场景按时长分段、完整 Skill 提示词生成和逐条建议时长，保留人工流程。

**Architecture:** 新增独立的整场规划、逐条 Skill、核对与原子提交管线；纯核心函数承担文本覆盖、合同校验和状态合并。App 生命周期控制器负责当前账号、后台任务及持久检查点，UI 仅启动和展示；原人工、创造模式不改路由。

**Tech Stack:** 现有 JavaScript ESM、React、Electron CJS、Node `node:test`、本地 JSON 与现有腾讯云分集文档；不新增外部服务，不引入 Python 运行依赖。

**Spec:** `../specs/2026-10-02-director-auto-segmentation-design.md`，必须先完整阅读。

**执行状态（2026-10-02）：** 用户已要求执行，任务 1～7 已实现并完成自动测试及模拟页面验证。工程、发布与逐项证据见 [第一阶段验收记录](../validation/2026-10-02-director-auto-segmentation-phase1.md)。下列清单保留原实施步骤，真实单场景质量反馈和第二阶段门禁仍待用户试用。

## Global Constraints

- 当前为规划交接；只有用户换模型并要求执行后才开始本计划。第二阶段暂不执行。
- 最高时长为 1～30 的整数秒；自动模式默认 30；老项目默认人工。
- 非尾段候选窗口 `[ceil(0.85 × T), T]`；建议秒数为估计总长向上取整，禁止截到上限掩盖超长。
- 完整 Skill 主文件及附属文件必须发送，不修改导入的 Skill、不执行导入脚本、不静默截断。
- 原文、人工 quickSceneEdits、创造模式与旧提示词保留；新记录 `generationMode='quick'`。
- 无真实费用的模拟测试为默认；真实付费请求须由用户自行发起或明确授权，模拟通过不得宣称提示词/视频效果已验证。
- 遵从 `tencent/AGENTS.md`，软件完成后需要发布可在应用内更新的新版本。规划文档本身不触发版本发布。

## Review Focus

1. 长独白、重复句子和正文内数字括号：以来源区间覆盖及台词归属判断，不用全局字符串替换（任务 1、3）。
2. 模型返回一个完整结果同时又给分析/错编号/第二条结果：不得借当前宽松 parser 的兜底误报成功（任务 3、5）。
3. 用户在请求中改原文、切账号、删除分集或重排总剧本：晚到回包不串写，历史不丢（任务 5、6）。
4. 保存成功前崩溃、重复点击继续、删除后恢复旧任务：同一 run 幂等，不重复计费已成功请求或复活结果（任务 4、5）。
5. 云端旧字段缺失、双端新计划冲突、导出再导入、编辑提示词后旧时长：保留可追溯元数据并诚实展示状态（任务 6、7）。

## 文件分工

| 新增/修改 | 文件 | 责任 |
|---|---|---|
| 新增 | `core/directorSegmentation.js` | 来源单元、结束锚点、计划 schema/覆盖/时长校验、括号稿渲染 |
| 新增 | `core/directorSegmentationMessages.js` | 内置规划与核对消息、完整场景参考和当前 Skill 输入 |
| 新增 | `core/directorPromptValidation.js` | 通用编号及 fast-v8 合同、台词和光影基准校验 |
| 新增 | `core/directorQuickGeneration.js` | 与 React 无关的自动生成状态机、恢复、有限修正 |
| 新增 | `core/directorQuickStore.js` | 快照、正式计划/提示词原子合并、修改失效处理 |
| 新增 | `core/directorPersistence.js` | 最新 state 的顺序保存及可等待的 flush |
| 新增 | `electron/director-quick-checkpoints.cjs` | 当前账号本地任务检查点的原子读写 |
| 新增 | `src/v06/useDirectorQuickGeneration.js` | 在 App 挂载的控制器适配器及订阅视图 |
| 新增 | `src/v06/DirectorQuickControls.jsx` | 分段方式、秒数、进度、原文/分段稿视图控制 |
| 新增 | `core/directorEpisodeReconcile.js` | 总剧本再解析时保留身份及识别失效计划 |
| 新增 | `core/promptTiming.js` | 建议时长元数据的验证与导入导出编码 |
| 修改 | `core/skillExecution.js` | 可选 taskId、输出额度、envelope 与取消关联，旧调用兼容 |
| 修改 | `core/projectStore.js`、`core/directorCloudProjects.js` | 历史、编辑、云合并；使用新 reducer，不重写全 store |
| 修改 | `src/App.jsx`、`src/v06/DirectorWorkspace.jsx`、`src/workspace-polish.css` | 生命周期、单场景入口、PromptCard 徽标、布局 |
| 修改 | `electron/main.cjs`、`electron/preload.cjs` | 检查点 IPC；已有模型 IPC 沿用 |
| 修改 | `core/promptBook.js`、`src/v06/PromptBookWorkspace.jsx` | 导出重导入保留建议值，不自动替用户选视频时长 |

测试文件放在 `core/*.test.js` 或 `electron/*.test.cjs`，现有 `scripts/test.cjs` 自动发现。测试 fixture 用少量自造人物/剧情，不提交本机用户整套剧本、Skill 内容或 API 配置。

## 任务 1：可证明覆盖的分段计划

**Files:** 新增 `core/directorSegmentation.js`、`core/directorSegmentation.test.js`。

**Interfaces:**

- `buildSceneSourceTape(inputText: string) -> SourceTape`：保存原输入、规范正文、共享标题、unit ID 与原文映射；只移除严格的独立数字括号标记。
- `validateScenePlan(candidate, { tape, maxDurationSeconds }) -> { ok, plan?, issues[] }`：JSON 结构校验、锚点转区间、覆盖与时长验证；issues 含 code、segmentIndex、证据。
- `renderNumberedScene(plan, tape) -> string`：只从已验证区间取正文，加共享场景标题和独立 `（k）`，不把 visualNotes 当原台词。
- `assertDurationLimit(value) -> integer`：非法值抛清晰错误。

- [ ] **写失败测试。** 有适合切点的 40 秒受控计划得到 `[30,10]`；估计 `30.01` 上限 30 报超限而非截成 30；0/31/小数/NaN 拒绝；1/30 允许。5 秒非尾段在 30 上限下报 `UNDERFILLED_SEGMENT`，尾段 5 秒通过。
- [ ] **补覆盖与边界测试。** `(1)`、`（2）` 只作独立控制行；正文 `（2026年）`、道具数量和台词括号不消失。锚点乱序/越界/未覆盖结尾/重复/空段拒绝；长独白精确前缀切分后所有片段原文拼回完整；含 emoji/组合字符不能半个字符切开。
- [ ] **运行红灯。** `node --test core/directorSegmentation.test.js`，确认失败因未实现而非 fixture 错误。
- [ ] **实现上述纯函数。** 单元按段落/语义标点形成，单元内 prefix 必须为真实完整前缀，落在合法词语边界；采用 `Intl.Segmenter` 或等价 Unicode 安全处理。日期、编号、元信息本身不虚构表演时间。计时公式和 85% 窗口只在一处定义。
- [ ] **运行绿灯并提交。** 同一命令全过，提交仅此任务文件。对已有 parser 只复用或在本模块适配，不扩大旧人工 parser 的识别范围。

## 任务 2：项目上下文与消息合同

**Files:** 新增 `core/directorSegmentationMessages.js`、`core/directorSegmentationMessages.test.js`；修改 `core/skillExecution.js`，扩充 `core/skillAiExecution.test.js`。

**Interfaces:**

- `buildSegmentationMessages({ snapshot, tape, validationIssues? }) -> Message[]`。
- `buildSegmentSkillRequest({ snapshot, tape, plan, segment, sharedBaseline, previousPrompt }) -> { input, beforeUserMessages }`。
- `buildSceneAuditMessages({ snapshot, tape, plan, prompts, range? }) -> Message[]`。
- `executeSkillWithAi({...existing, requestOptions?}) -> { output, meta }` 保持既有返回。新可选项仅允许 `taskId / maxOutputTokens / resultEnvelope / timeout` 等确需字段；不要允许 options 覆盖 profile、messages、skillId。

- [ ] **写消息捕获测试。** Mock `api.aiChat` 验证规划请求含风格、画幅、上限、设定资料、全场原文；Skill 请求含六个模拟文件完整内容，最后 user 消息只有当前提交括号，参考场景以非提交格式提供。第二条收到第一条的固定光影基准及末态，不把第二条起态重置。
- [ ] **写兼容/错误测试。** 老调用仍返回原结构；带 envelope 的失败变为保留 `partialText` 的错误；taskId 能传给 main；完整 Skill 超过假定容量时显式报错，不能截短。不能只因 Skill 名含 v8 就替换它的内容。
- [ ] **红灯验证。** `node --test core/directorSegmentationMessages.test.js core/skillAiExecution.test.js`。
- [ ] **实现构建器与请求扩展。** 使用原 `buildProjectPreamble` / `buildSkillMessages`，参考消息明确资料与提交内容的边界，输出合同仍由用户 Skill 负责。上限不是要求每条都写同一秒数；每次带本段建议值。明确禁止增加剧情、搬移台词和重复完整句。
- [ ] **绿灯与兼容回归。** 运行上述测试及 `node --test core/skillCompleteAttachment.test.js core/skillExecution.test.js core/unifiedSkillExecution.test.js`；提交。

## 任务 3：生成结果与语义核对适配

**Files:** 新增 `core/directorPromptValidation.js`、`core/directorPromptValidation.test.js`。

**Interfaces:**

- `identifyPromptContract(skill) -> 'fast-v8'|'generic'`：从可识别合同结构/内容指纹判断，不靠可变名称；不运行 Skill 内脚本。
- `validateGeneratedSegment({ output, expectedLabel, source, contract, sharedBaseline }) -> { ok, prompt?, baseline?, issues[] }`。
- `parseSceneAudit(output, { plan, range }) -> { ok, issues[] }`：只接受结构化问题，引用必须属于被核对片段/原文范围。

- [ ] **写失败测试。** 输出少段/多段/错集场号、只有分析文字、空文本不能成功。明确兼容 `集-场-条` 或可唯一映射当前条的旧括号格式，但禁止依赖 parser 对任意文字的 label=1 兜底。
- [ ] **写内容测试。** 自造 v8 fixture 检查五个区块、每镜六行、同场基准仅忽略排版空白；关灯后的事件终态作为语义审核 fixture。台词原字缺漏/重说、跨条一句话补两次可发现；必要的人物名单重复不能误判重复台词。无法可靠提取台词的通用 Skill 交语义审核并标明结构检查能力。
- [ ] **写审核输出校验。** 审核返回无效片段引用、截断 JSON、没有明确结论或空响应均不得当通过；允许“无问题”的完整结构。真正状态/事件关系以 AI 核对与人工试用判定，测试不要假装正则能理解所有剧情。
- [ ] **红灯。** `node --test core/directorPromptValidation.test.js`。
- [ ] **实现与绿灯。** 只读借鉴已研究的 Skill 合同，代码内实现必要验证，不复制或执行用户导入 Python。保留可解释问题码便于有限修正。通过后提交。

## 任务 4：当前账号持久检查点和顺序写入

**Files:** 新增 `electron/director-quick-checkpoints.cjs`、`electron/director-quick-checkpoints.test.cjs`、`core/directorPersistence.js`、`core/directorPersistence.test.js`；修改 `electron/main.cjs`、`electron/preload.cjs`、`src/App.jsx` 的状态保存适配部分。

**Interfaces:**

- `createDirectorQuickCheckpoints(dataDir, getAccountId) -> { list(), load({runId}), save({run}), remove({runId}) }`，参考已有 `analysis-checkpoints.cjs`，当前账号由 `readCloudSession()?.account?.id` 解析。
- preload API：`directorQuickListRuns()`、`directorQuickLoadRun({runId})`、`directorQuickSaveRun({run})`、`directorQuickRemoveRun({runId})`。IPC 名称使用 `director-quick-*`。
- `createDirectorPersistence({ saveState, saveDirectorProjects }) -> { enqueue(state), flush(): Promise<void>, dispose() }`：串行写最新快照，两份既有文件保存失败可被调用方得知；跳过排队中被更新快照淘汰的旧写入。

- [ ] **写隔离/恢复失败测试。** 账号 A 无法读写账号 B 的 run；不接受任意路径、`../` 或外部文件地址；保存中断仍可加载上一个有效 JSON；丢失/损坏检查点报告错误而非生成空 run。递归检查序列化对象不含 apiKey、token、完整 profile 凭据。
- [ ] **写写入竞争测试。** 延迟旧 snapshot 写入，同时 enqueue 新 snapshot，最终落盘为新 state；flush 等到新 snapshot 真正落盘；保存失败不报告 completed。不得在 React updater 内触发 IO。
- [ ] **红灯。** `node --test electron/director-quick-checkpoints.test.cjs core/directorPersistence.test.js`。
- [ ] **实现 IPC 与 writer。** 文件名由账号/run 安全键生成、限制字段/schema，临时文件原子替换；main 对调用方使用主窗口/可信 frame 检查及当前会话身份，不复用 WorkBuddy 专属权限或只信 renderer 的 accountId。browser mock 提供同签名内存实现。
- [ ] **改 App 的 debounce 接入同一个 writer。** 新管线强制 flush 与原 250ms 自动保存共用顺序，不增加第二个直写路径。只改必要保存适配，旧应用加载规则和备份保留。
- [ ] **验证数据目录切换。** 有自动任务运行时暂停并 flush 后才允许切换；已有任务索引显示原位置，不能切换后假称已迁移。若要迁移本功能检查点，按同一数据目录迁移路径复制并验证，再修改配置；不移动/删除用户已有资料。
- [ ] **绿灯与提交。** 运行本任务及 `node --test electron/director-local-persistence-and-fixed-groups.test.cjs`；原源码形状断言如因合理提取变化，替换为真实保存行为证据，不简单删测试。

## 任务 5：单场景管线、取消恢复和原子提交

**Files:** 新增 `core/directorQuickGeneration.js`、`core/directorQuickGeneration.test.js`、`core/directorQuickStore.js`、`core/directorQuickStore.test.js`。

**Interfaces:**

- `createSceneSnapshot({ accountId, project, episode, sceneLabel, inputText, maxDurationSeconds, skill, profile }) -> Promise<SceneSnapshot>`：使用 SHA-256 固定原文、设置、完整 Skill、公开模型配置指纹；不把凭据持久化。
- `createQuickGenerationController({ getContext, executeText, executeSkill, checkpoints, commitRun, onChange }) -> { start(sceneRequest), resume(runId), stop(runId), get(runId), subscribe(listener), restore() }`。`getContext({accountId,projectId,episodeId,sceneLabel,skillId,profileId})` 返回当前账号与指定目标的 `{ accountId, project, episode, inputText, skill, profile, permissions }` 或明确缺失结果；不能改用界面当前选中的其他场景/Skill/profile。
- `commitQuickSceneRun(state, run) -> { state, applied, conflict? }`：验证最新目标仍存在、输入及设置匹配、全部草稿通过，使用预分配 promptIds 同时更新分集/历史/计划/活动指针；重复调用幂等。
- `markPromptTimingStale(prompt) -> prompt`：保持估计值，改 durationStatus。
- dependencies 的 `executeText({messages, taskId, profileId, requestOptions})` 和 `executeSkill({skillId,input,beforeUserMessages,taskId,...})` 返回正文或携带 partialText 的错误；`commitRun(run): Promise<{applied,conflict?}>` 必须等待持久化确认。

- [ ] **写完整行为测试。** 模拟规划给出 30+10，两次 Skill 串行且第二次收到首条基准，审核通过后同一次 reducer 写入两条及历史，编号/segmentId/建议秒数匹配；请求参数快照固定。
- [ ] **写故障矩阵测试。** 规划无效最多修正一次；第 3 段失败前两条仅在草稿，恢复不重调前两条；部分文本/超时/取消不当作成功；停止后晚回包忽略；失败审核修复前序后依赖的后序/审核失效。网络状态不明不得无上限自重试。
- [ ] **写并发/崩溃测试。** 同一账号项目集场只有一个活动 run；跨页面不丢任务；换账号、删除项目/集/场、改原文/风格/设定/Skill 导致 stale；在 ready-to-commit 之后任意时刻崩溃，恢复只有一套 promptIds；删除墓碑不复活；不能只追加历史而没有对应分集。
- [ ] **红灯。** `node --test core/directorQuickGeneration.test.js core/directorQuickStore.test.js`。
- [ ] **实现状态机与 reducer。** 应用内置计划→验证→逐条 Skill→逐条验证→全场审核→outbox 提交。每步先保存检查点再推进；计划验证后分配固定 N 个 promptIds，质量修正上限一轮/失败单元，不对已成功片段重新调用。两份正式存储确认后才压缩 completed 回执，暂停/失败草稿不清除。暂停后模型可能仍已计费，UI 不承诺撤销费用。
- [ ] **实现适度容量检查。** 参考现有 provider 限制与响应错误，完整输入不可被默默裁剪；一个片段输出也被截断时保存错误和 partialText，调整输出额度或让用户换适合模型。不要通过缩短原台词规避长度限制。
- [ ] **绿灯与提交。** 加跑 `node --test core/directorPromptIsolation.test.js core/directorOutputSplit.test.js core/promptHistory.test.js`。

## 任务 6：云合并、总剧本重建与历史保留

**Files:** 修改 `core/directorCloudProjects.js`、`core/projectStore.js`、`src/v06/DirectorWorkspace.jsx` 两处总剧本重解析；新增 `core/directorEpisodeReconcile.js`、`core/directorEpisodeReconcile.test.js`、`core/directorQuickPersistence.test.js`。

**Interfaces:**

- `reconcileDirectorEpisodes(previousEpisodes, parsedEpisodes) -> { episodes, invalidatedPlanIds, conflicts }`：唯一身份匹配时保留，歧义时不按位置继承活动计划。
- `mergeQuickScenePlans(localEpisode, cloudEpisode, baseEpisode?) -> { plans, activePlanIds, conflicts }`：按 plan.id 合并不可变计划，活动指针冲突显式保留。可放在新 store 或 cloud 模块，但只能有一处实现。
- 现有 `updateDirectorPromptEverywhere` 调用处使用 `markPromptTimingStale`，不改普通旧记录的未知字段。

- [ ] **写重建测试。** 添加一集后原集/场计划保留；插入到第一集前、删除、重排、相同标题不同正文、同标题同正文造成歧义时不串绑；原文变动使活动计划失效而历史完整。改变场景编号不能复用另一场时长。
- [ ] **写持久与云测试。** normalize/load/save 往返保留计划及秒数；无 cloudBase 的旧云记录缺新字段不抹掉本地计划；同 id 合并、不同 id 并存；同场双端切活动计划产生可见冲突；删除后拉云不复活；本地运行中收云变更不掩盖 stale。
- [ ] **红灯。** `node --test core/directorEpisodeReconcile.test.js core/directorQuickPersistence.test.js`。
- [ ] **实现。** 新计划数组用稳定 ID，继续使用现有三方合并与墓碑；总剧本处理提取小纯函数，避免两处 .map 显式白名单漏新字段。没有充分证据保持 ID 时留历史，不自动决定其属于新集。
- [ ] **绿灯与提交。** 加跑 `node --test core/directorCloudSave.test.js core/directorFeatures.test.js core/promptHistory.test.js`；如接口确实裁剪新分集字段，再补对应后端保存/读取测试，不无依据扩展数据库 schema。

## 任务 7：UI、导出与提示词时长关联

**Files:** 新增 `src/v06/useDirectorQuickGeneration.js`、`src/v06/DirectorQuickControls.jsx`、`core/promptTiming.js`、`core/promptTiming.test.js`；修改 `src/App.jsx`、`src/v06/DirectorWorkspace.jsx`、`src/workspace-polish.css`、`core/projectStore.js`、`core/promptBook.js`、`src/v06/PromptBookWorkspace.jsx`。

**Interfaces:**

- `useDirectorQuickGeneration({ state, setState, api, accountId, persistence }) -> { startScene, resume, stop, runs, getSceneRun }` 在 App 挂载，依赖中的 getContext 读最新 refs；窗口切换不换 controller。通过 props 或局部 context 接入 DirectorWorkspace，不做全站状态重构。
- `DirectorQuickControls` 消费 `settings / onSettingsChange / run / onStop / onResume / sourceView / onSourceViewChange`；生成按钮保留在原 Skill 工具条。
- `formatPromptTimingMetadata(prompt) -> string`、`extractPromptTimingMetadata(text) -> {text, timing?}` 使用 Spec 的独立行格式，仅已验证整数范围可导入。

- [ ] **写时长往返测试。** 自动条目导出→parsePromptBook 后 `recommendedDurationSeconds=10`、上限 30；实际 prompt 不含应用元数据；待复核状态保留。老文档、正文出现“30秒”、不存在/损坏的 metadata 不被当作有效建议，不自动修改实际视频 duration 设置。
- [ ] **实现 UI 接线。** 人工模式调用原 runQuickScene，自动模式调用 controller；auto 的只读分段稿来自 plan 渲染。原文改动自动显示计划已过期。只取 prompt 自身 metadata 显示徽标；手工编辑同时更新历史与待复核状态。
- [ ] **实现运行订阅与保存提交。** App context 比较账号；commitRun 使用最新 state 合并并通过同一个 writer flush，完成再更新检查点；UI 订阅只显示本账号任务，不把活动任务挂在会卸载的 EpisodeDirector 内。
- [ ] **实现导出与整本条目提示。** 外层 `【集-场-条】` 不变；原复制仍为完整 Skill 正文；图视生成仅显示建议，不自动替用户设置视频时长。
- [ ] **基础测试。** `node --test core/promptTiming.test.js core/promptBook.test.js core/promptHistory.test.js`。
- [ ] **真实浏览器或 Electron UI 模拟验证。** 采用隔离测试数据目录与 mock api：在最小窗口 1120×720、常用 1500×940 和截图附近尺寸检查并列/换行；键盘操作切模式、选 1/15/30、生成、停止、恢复、切场景/页面；失败草稿与正式结果分开，编号与徽标对应，编辑后标“时长待复核”。截图检查标题、Skill、按钮无重叠，不仅靠源代码正则。
- [ ] **提交。** UI 工件保存到验证目录，不提交用户私有资料或登录凭据。

## 任务 8：整合、质量门槛与第一阶段发布

**Files:** 必要时 `package.json`、锁文件、`release-notes/<next-version>.md`、正式发布清单；实现验收记录写 `docs/superpowers/validation/2026-10-02-director-auto-segmentation-phase1.md`。

- [ ] **逐项核对 Spec 第 10 节。** 每项记录对应自动测试或 UI 证据。用自造 40 秒、150 秒受控 fixture 检查逻辑；这不是对真实剧本的实测证明。
- [ ] **运行最终工程检查。** `npm test` 和 `npm run build` 均成功。任何失败按原因修复并重跑受影响测试，不宣称已有 2.4.9 的测试结果覆盖本次修改。
- [ ] **审查最终 diff。** 对照“完整 Skill、连续性上下文、尾段、错误恢复、历史与云”检查；确认没有调付费接口、改真实项目数据或篡改导入 Skill，新增日志不包含密钥。
- [ ] **发布第一阶段软件。** 从当前版本/远端已发布版本确定 next-version（研究时为 2.4.9，执行时不得盲写 2.4.10），更新发布说明及版本，提交源码，按仓库 `npm run release` 流程打包发布，验证公开 latest.json 的版本、URL、大小和 SHA256。不要将本计划中的“未验证真实文本效果”删成已经验证。
- [ ] **交付用户进行实际单场景试用。** 给出入口和 3 组用例：对白场景（15/30 对照）、动作及状态衔接、短场景/短尾段。实际付费调用由用户点击，或另有明确授权才代测；不为了自行通过门槛偷偷产生模型费用。
- [ ] **阶段门禁。** 记录用户对真实提示词的反馈和必要修正。用户认可单场景后才执行第二阶段计划；本轮不能顺手加入整本按钮或开启 95 集任务。

## 完成汇报应包含

单场景新功能和原人工模式的入口；已发布版本；通过的测试/UI 验证；真实文本或视频是否试验过；尚待用户确认的单场景质量。不要把第一阶段发布描述成整本功能已经完成。
