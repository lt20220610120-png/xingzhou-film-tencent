# 导演整本自动生成第二阶段 Implementation Plan

> **For agentic workers:** 使用 `superpowers:executing-plans`，按复选框执行。本计划有阶段门禁，不能因为第一阶段代码测试通过就自行开始整本功能或运行整本付费任务。

**Goal:** 在用户已认可的单场景自动分段基础上，一键按集、场顺序生成整本提示词，并提供进度、恢复与失败重试。

**Architecture:** 整本任务只负责枚举与调度，调用第一阶段同一个单场景 controller 和 commit reducer。批次清单和场景检查点持久保存；新增 App 级云同步协调器，避免任务在用户切走项目后只存本地。

**Tech Stack:** 现有 React、Electron、JavaScript、Node `node:test`、本地 JSON 与既有腾讯云 API，无新增平台或数据库。

**Spec:** `../specs/2026-10-02-director-auto-segmentation-design.md`。

**前置实施:** `2026-10-02-director-auto-segmentation-phase1.md` 已完成发布，用户使用真实场景确认后明确进入本阶段。研究时仅有设计，未满足此前置。

## Global Constraints

- 最高时长仍为 1～30 整数秒，分段/尾段/连续性规则全部复用第一阶段，不写第二套算法。
- 不跨场景凑满时间；“设定和小传”只作背景资料，不当作第 1 集生成。
- 默认场景并发数 1，不以 `Promise.all` 启动整本；每场内部仍串行按片段生成。
- 默认跳过有已有提示词的场景，重新生成需在启动摘要明确选择，仍保留旧结果。
- 每个完成场景立刻独立落盘；退出应用不承诺继续生成，重开显示可恢复任务，由用户点击继续。
- 不将 API Key 或完整 profile 写入任务清单；本机活动任务不随云项目迁移到另一台机器执行。
- 模拟验证不产生费用；实际整本运行由用户主动发起。发布遵从 AGENTS。

## Review Focus

1. 设定卷、空集、被删集和没有标题的场景：与界面一致编号，跳过空内容但不压缩原本集号（任务 1）。
2. 已有人工/创造提示词、半成功旧记录和本轮中断草稿：保守跳过与本轮恢复须区分（任务 1、2）。
3. 暂停与当前请求晚回包、断网、重启、接口 429：不爆发重试，不将未完成算完成（任务 2）。
4. 两窗口入口并发启动同一场景、跨账号恢复、多个机器同时写云：锁、权限与冲突都可解释（任务 2、3）。
5. 用户切走项目，新增生成结果仍在本地增长：后台云同步不可依赖选中项目，不能旧快照覆盖新输出（任务 3、4）。

## 任务 0：验证阶段门禁

- [ ] 阅读第一阶段验收记录，确认安装版本及用户反馈，核实真实文本的 15/30 对照、短尾段和状态衔接已试用。
- [ ] 若用户还没认可单场景，只修单场景问题并报告，不开始以下任务。若认可，记录进入第二阶段的用户消息依据。
- [ ] 对比当前实现和 Spec 的实际差异，更新本计划的函数签名/文件位置，使计划对着真实第一阶段实现执行；不得把偏差留作隐含假设。

## 任务 1：整本枚举、范围预览和快照

**Files:** 新增 `core/directorBatchGeneration.js`、`core/directorBatchGeneration.test.js`。

**Interfaces:**

- `enumerateDirectorSceneTargets(project) -> SceneTarget[]`：沿用 UI 的正片集号与 `parseDirectorScenes`，优先场景 quickSceneEdits，返回 episodeId、episodeNumber、sceneLabel、sourceHash、已有结果数量。
- `createDirectorBatchPlan({ accountId, project, skill, profile, maxDurationSeconds, existingPolicy }) -> Promise<BatchPlan>`。
- `existingPolicy = 'missing-only'|'append-all'`；BatchPlan 含稳定 batchId、项目/设置/Skill/profile 指纹、有序场景表、跳过原因和各 sceneRunId，不保存 API Key。

- [ ] **写失败测试。** `[设定, 第1集, 空第2集, 第3集]` 只生成第1/3集的非空场景，编号与界面一致；无标题的一集按现有规则为一场。修改过的场景正文以 quickSceneEdits 为准。
- [ ] **写范围策略测试。** 默认任何已有提示词场景（人工/创造/旧版也包括）跳过，显示“已有结果，未验证完整性”；append-all 保留旧结果。当前 batch 中的 interrupted run 不因草稿存在而被跳过；空场景原因可见。不存在模型/Skill 或非法上限拒绝启动。
- [ ] **红灯。** `node --test core/directorBatchGeneration.test.js`。
- [ ] **实现与绿灯。** 先给正片分集编号再过滤空内容，不给“设定和小传”生成任务；全部场景固定同一批模型与 Skill，不能暗用每集不同的旧记忆设置；提交。

## 任务 2：持久队列、暂停恢复与进度

**Files:** 在 `core/directorBatchGeneration.js` 增加 controller；扩充其测试；修改第一阶段 `core/directorQuickGeneration.js`、`electron/director-quick-checkpoints.cjs` 及对应测试。

**Interfaces:**

- `createDirectorBatchController({ sceneController, checkpoints, getContext, onChange }) -> { start(plan), pause(batchId), resume(batchId), retryFailed(batchId), cancel(batchId), get(batchId), subscribe(listener) }`。
- checkpoint 增加 `kind:'scene'|'batch'` 和 schema version；缺少 kind 的第一阶段文件按 scene 兼容读取。
- sceneController 增加 `pauseAfterRequest(runId)`：当前一个模型请求结束并落检查点后暂停，不继续下一个请求；`stop` 仍为立即取消并拒绝晚回包。

- [ ] **写调度测试。** 模拟 3 集 2 场共 6 场，最多一个场景执行，各 scene request 使用冻结设置；每场复用第一阶段计划/Skill/审核/commit，没有跨场合并尾段。
- [ ] **写恢复测试。** 第3场第2条失败，前2场正式保存，第3场草稿可恢复；重开无自动收费请求；点击继续只处理未完成部分。重复 resume/retry 不启动两份，单场景入口与批处理共用场景锁。
- [ ] **写故障策略测试。** 单场内容问题标 failed 后可处理下一场；鉴权失效、模型不存在、持续接口 429 等系统性错误暂停整队；pause 在当前请求落盘后停止调度，cancel 取消当前请求并保留已完成结果；模型回包后账号切换不越权提交。
- [ ] **红灯。** `node --test core/directorBatchGeneration.test.js core/directorQuickGeneration.test.js electron/director-quick-checkpoints.test.cjs`。
- [ ] **实现队列。** batch manifest 只引用 sceneRunId 与来源指纹，不重复储存 N 份项目/Skill/原文。每次状态变化先持久化，重启 running → paused。场景源修改后只把对应目标标 stale，不混用新旧内容继续同一计划。
- [ ] **规范错误类别。** 优先沿用第一阶段 typed error；若 main envelope 仍仅字符串，给本功能增加可选 `code/status` 并在 `electron/ai-service.cjs`、`electron/main.cjs` 加非破坏兼容，测试旧字符串调用仍工作。不要仅靠中文错误关键词决定全部重试。
- [ ] **绿灯与提交。** 包含大清单（数百场）的模拟测试，核实没有按场景数同时申请几百个模型请求，进度分母是明确目标总数，跳过不计成功。

## 任务 3：项目级后台云同步

**Files:** 新增 `core/directorCloudSync.js`、`core/directorCloudSync.test.js`；修改 `src/App.jsx`、`src/v06/DirectorWorkspace.jsx` 的 selectedProject 自动保存适配；复用 `core/directorCloudProjects.js`。

**Interfaces:**

- `createDirectorCloudSync({ getContext, updateProject, acknowledge, onConflict }) -> { enqueue(projectId), flush(projectId), pauseAccount(accountId), dispose() }`。
- `updateProject({projectId,base,updates})` 使用现有 `api.directorCollabUpdateProject`；`acknowledge` 使用现有 `acknowledgeDirectorCloudSave`，不得直接用服务器旧对象替换当前本地 state。

- [ ] **写失败测试。** 用户切到别的项目仍将完成场景同步原云项目；相同项目最多一个请求在途，多次 enqueue 合并最新 snapshot；保存回包期间用户新编辑不会被覆盖。
- [ ] **写权限/冲突测试。** 无权限、已锁定或云删除时停止云写并保留本地完整结果；独立 prompt ID 可合并，活动计划同场冲突可见，不伪造新的成功云基线；账号变动取消旧账号队列。
- [ ] **红灯。** `node --test core/directorCloudSync.test.js core/directorCloudSave.test.js`。
- [ ] **实现与接线。** 抽取原 selectedProject 900ms 自动保存为共享协调器，普通编辑和批处理完成都走同一队列；旧组件不得再保留一个并行云保存器。本地提交成功与云同步成功分别显示，不因云失败重复调用付费生成。
- [ ] **绿灯与提交。** 再跑第一阶段云/历史测试，确保本地项目不无故发云请求，不依赖本机超权绕过协作权限。

## 任务 4：整本入口与任务面板

**Files:** 新增 `src/v06/DirectorBatchPanel.jsx`；修改 `src/v06/useDirectorQuickGeneration.js`、`src/v06/DirectorWorkspace.jsx`、`src/workspace-polish.css`；必要时增加对应行为测试 fixture。

**Interfaces:**

- 项目层“一键生成整本提示词”调用范围预览，再启动 batchController；不复用当前场景生成按钮，也不在页面加载时触发。
- 预览显示当前模型名称、Skill 名及文件数、上限秒数、正片集数/场数、已有结果处理策略。提示“各场分段数量将在分析后确定”，不编造总费用。
- 任务面板订阅 batch snapshot：已完成/失败/跳过/待处理、当前集场及片段、最近错误、暂停/继续/重试失败/结束任务、跳到对应场景。

- [ ] **实现 UI。** 固定本批参数；进行中改页面设置仅影响未来新任务，不更改运行批次。主动点击“开始生成”明确启动范围，过程中不每场弹确认。结束任务只停止未完成工作，不删除已完成提示词。
- [ ] **模拟 UI 验证。** 少量 fixture 模拟全剧，切到第一集第一场确有括号稿与提示词，回最后一场尾段建议时长正确；跳过旧场景原因可查；失败后重开与恢复不重复；切页面仍显示任务状态；整本入口只在用户允许的导演项目范围可用。
- [ ] **检查布局。** 延用第一阶段控件高度与字体，宽/窄窗口任务列表可滚动，常用操作不因大进度文本被挤出，旧项目设定与单场生成入口保留。
- [ ] **提交 UI 与证据。** 不使用用户 95 集数据执行付费验证；可用相同规模的自造场景数压测队列。

## 任务 5：发布与交付

- [ ] 运行 `npm test`、`npm run build`，复验第一阶段单场景及手工流程。
- [ ] 用隔离模拟接口完成整本开始→中断→重启→继续→全部结束的端到端验证，核对各场提示词、建议时长、历史及云同步状态。
- [ ] 发布下一版本与 release notes，提交源码、打包、验证安装包启动和公开 latest.json 的版本/URL/大小/SHA256。
- [ ] 交付写明整本生成路径、默认跳过策略、暂停恢复方式和实际文本/视频是否已经试用。只有用户主动启动或明确授权后才运行真实整本模型任务。

## 本阶段完成定义

每个纳入任务的场景均能定位到自己的分段稿与提示词，失败/跳过可解释、可恢复；不会把跨场景原文合为一条，不会为尾段凑满，不会因切页面或普通重启丢已完成结果。整本队列只是经过验证的单场景管线的调度层。
