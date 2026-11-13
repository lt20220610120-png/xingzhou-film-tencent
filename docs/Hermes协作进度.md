# Hermes 协作进度档案

本文件是 Hermes 与 Codex 共用行舟影视项目时的固定交接入口。Codex 开始后续任务前必须读取本文件，并继续核对实际 Git、代码、测试和公开发布状态；不要仅凭本文件快照作结论。

## 2.8.158 交接（2026-11-13）

- 当前实现 `aa4bfbe`。最终全量3070/3070，构建、打包运行、7份关键ASAR源码逐字节核对通过。安装包104044364字节，SHA256 `2bd15d5d36fb10906c7b882bad90c838e73ad597be13bd72599377ec37949cfb`。
- 用户纠正后，内容预估与单条时长上限独立，应用到全剧只保存参考原文身份、确认秒数、节奏和换算尺度。已确认45秒后把上限改15秒，仍为45秒、3条；右侧保存三条15秒。
- 生成控制器正式入口默认由所选完整Skill执行、自检，软件只核对外层分发编号及回包完整性，不按Skill版本或字段推断正文合同。既有固定审核仅供历史回归显式调用，界面无入口。客户自定义比重与附件隔离实测通过。用户要求已写入AGENTS.md。
- LibTV新增API直连、素材独立代理选择回归。未发真实付费生成；真实账号、模型、官方接口和素材域名只读探测通过，未能锁定截图那一次中断的具体阶段。
- 2.8.156、157曾生成官网独立包，GitHub草稿上传取消，正式清单一直维持2.8.154。后续发布以本版验收记录和最新实际公开状态为准。
- 本版现已公开发布。Release443827392资产uploaded且digest匹配，三份公开清单一致并验签，官网Range及服务整包哈希通过；真实弹窗154→158下载/续传/校验/安装回调通过。发布构建与流程验收详见 `docs/release-verification-2.8.158.md`。

## 2.8.156 交接（2026-11-13）

- Hermes 仍返回 401，本轮由 Codex 执行。实现提交 `0318170` 已推送。
- 场景先预估秒数和条数，点「应用到全剧」锁定当前基准；整本任务用同一尺度估算各场，再找原文切点。隔离 Electron 45秒/2条应用后，滑轨再改动不覆盖全剧基准，右侧显示并保存 30/15 秒两条。模型回包为模拟。
- v8.5 分数合同按整数分数校验和，保留模型分配；全等时提醒复核。LibTV 系统代理预检通过但新 CONNECT 失败时，发送 CLI 数据前可回退直连。真实账号、模型及官方 API/素材域名只读验证。具体边界见 `docs/release-verification-2.8.156.md`。
- 全量 3068/3068，构建与打包运行 PASS。官网包 104045568 字节，SHA256 `7335028ca8a20e2a8c46790bfb0dec21f68b077fc53788a5eb439eddf3fbaf57`。

## 2.8.155 交接（2026-11-13）

- Hermes 默认模型 401，本轮由 Codex 接手；实现提交 `581c456` 已推送。后续开发仍按项目约定优先 Hermes。
- 已修复旧弹窗只传版本、主进程却硬比 URL 的失配。新版主进程仅下载自己已经验签并向弹窗展示的版本，不在点击时重新拉清单；下载/安装保持 SHA256、大小、签名和防降级检查。故障旧版用户需要手动安装一次。
- 导演自动分段向左增加极紧凑范围，保留旧 0～100 节奏及快照，实时时长和生成计划用相同预算；Skill 和核对共同采用所选节奏。隔离界面长对白由 114秒/4条调到 80秒/3条，右侧显示并保存 30/30/20 秒三张提示词卡。
- 全量 3064/3064、构建、打包运行时及 ASAR 文件核对通过。新版弹窗真实 Electron 测试通过 2.8.154 官方包断点续传、整包哈希和安装回调。安装包 104026695 字节，SHA256 `788c6138c1cd85e99c3a98a395a9cb28c5b6eab8cd3ec75052f985e417d9577f`。公开发布核验见 `docs/release-verification-2.8.155.md`。

## 2.8.154 状态（2026-11-12）

- 当前执行代理：Hermes。后续修改由 Hermes 直接实施，不要求 Codex 后台进程保持运行。
- 当前开发/发布版本：**2.8.154**。本轮自动提示词链路、注册格式提示和协作界面修复已公开核验，详见下方154节。
- 上一版 **2.8.153**：已修复注册界面无法滚动（底部「创建账号」永远点不到、用户无法完成注册）的真实根因，新增卡密加密记住（下次以 `·····` 掩码填入、一键「验证并激活」），并删除激活页说明行与注册页冗余文案。安装包 **104,024,774 字节**，SHA256 `c4ced24a32481c0c960164e857c9989e54c18c45f8d57a0e650ad8c3b6621965`，GitHub Release `442522345`。
- 上一版 2.8.152：导演工作台自动分段「短剧三档连续节奏梯度滑轨」与整场时长重校准（安装包 104,026,831 字节，Release `442387453`）。
- 当前源码工作区：`D:/AI/Qwen3-TTS/xingzhou-release`。
- 当前分支：`codex/character-voice-workflow`。
- 2.8.148 实现提交：`cc376a7`；发布文档提交：`eb4eb96`。
- 外层工作区 `C:/Users/11599/Documents/ChatGPT/行舟影视` 保存用户资料、外层约定及 `软件更新记忆.md`，其 `tencent/` 和根目录提交可能落后于独立发布工作区，不得误当成最新源码基线。

## 2.8.154 已发布：自动分段→提示词→建议时长完整链路修复

- 用户再次明确：必须自动生成提示词并显示对应建议时长，保留原来的人工/自动分段、最高时长、节奏梯度；不能把右侧空白解释为正常空状态就结束。
- 截图重新读取：真实错误为 `all accounts are temporarily unavailable, please retry later`，不是 Skill 升级。真实检查点只读统计也出现规划阶段、Skill 阶段和核对阶段的同类失败；未改写任何真实任务或项目。
- 已复现并修复：可选 AI 估时请求失败原本阻断真实 Skill 生成，现沿用本地短剧估时/用户 pace 降级后继续；只读 AI 核对失败原本把已生成场景标为 failed，现保留卡片并以 `AUDIT_UNAVAILABLE` 提醒；用户切模型后点继续原本仍调用旧 profile，现把选中 profileId 传入既有安全迁移路径。
- 验证阶段：新增 `core/directorAutoPipeline.test.js`、`core/directorModelTransitions.test.js` 先红后绿，额外修复执行层STOPPED/权限/429不能降级继续付费，以及A→B→C合法模型转换链保存失败。最终全量 **3062/3062**。真实 Electron 隔离 UI `output/154-director-ui-report.json`：两条提示词14/15秒、`auto/15/pace50`保留、持久化2张、失败重生成不清旧卡、换模型继续成功。测试回包均模拟，未发付费请求。
- 最终构建打包运行时 **PASS**：`qa/packaged-smoke-2.8.154-1794476507121/report.json` 无errors；ASAR两份导演核心文件逐字节匹配工作区、注册校验已编入renderer。安装包104040420字节，SHA256 `0c3fa3e1a9c25d942dbb3aec56ec8863d4131e2698a889c2de1a271a36724b0c`。
- 状态：**已公开发布核验**。Release `442745126` uploaded；官网整包SHA256、Range206首64KiB、三份Ed25519清单与正式软件内更新全部通过，证据`output/review-154/public-verification.json`。注册服务端3文件部署并读回hash/health一致，stage/live各26项通过，备份`/opt/xingzhou-backups/registration-2.8.154-20261112T094400Z`。详见`docs/release-verification-2.8.154.md`。

## 2.8.153：注册界面无法滚动（阻断注册）修复、卡密记住一键激活、注册/激活页文案精简

- 用户反馈：注册界面滑动不下去、底部「创建账号」点不到，用户无法完成注册；卡密在本机记住后下次应以 `·····` 掩码填好、只点「验证并激活」；激活页「输入卡密，激活这台电脑上的软件。」这行字要删除；前端避免不必要的标签/说明/辅助/冗余微文案，用布局与层级自解释。
- 真实根因：
  1. `src/styles.css:69` 全局 `body{overflow:hidden}`；`src/account-access.css` 虽给 `.auth-screen` 设了 `height:100vh;overflow-y:auto`，但后加载的 `src/access-experience.css` 用 `height:auto;min-height:100vh` 覆盖，滚动容器失效——页面按内容撑高，超出部分被 body 直接裁掉，既不出现滚动条也无法滚到提交按钮。属**内容被裁切**而非表单校验拦截。
  2. `electron/software-license-client.cjs` 只在内存保存激活令牌，卡密从不持久化，故每次都要重新输入。
  3. `src/v06/AccountAccess.jsx` 渲染了大段说明、两张说明卡片、口号式标题与邀请码脚注，以及实际会关闭窗口的「返回上一步」。
- 修复：
  1. `.auth-screen` 改为 `height:100vh/100dvh; overflow-y:auto; overscroll-behavior:contain` 的独立滚动容器；`electron/access-window.cjs` 账号阶段窗口改为默认 `1320×880`、最小 `1000×660`。
  2. 注册字段改两列网格（账号/姓名、密码/确认密码、邮箱/邀请码 + 整行验证码），并收紧卡片内边距与标签间距——1320×880 下无需滚动、主按钮可见。
  3. 卡密记住：验证成功后用 `safeStorage`（DPAPI）加密写入 `software-license-card.json`（明文不落盘，加密不可用则不写）；新增 IPC `license-remembered-card` / `license-forget-card`；下次启动以 `type=password` 只读显示记住的卡密，主按钮直接可点，X 按钮（`aria-label="更换卡密"`）清除并聚焦输入框；验证失败不覆盖已记住的卡密。
  4. 删除激活页说明行、注册页口号/说明/脚注与「返回上一步」，只保留字段标签、发送验证码与唯一主操作。
- 验证：全量测试 **3033/3033**；新增 `electron/license-card-memory.test.cjs`（3 例）、`electron/access-screens.test.cjs`（2 例），更新 `electron/access-window.test.cjs`；真实 Electron 实测 1320×880 无溢出、1000×660 滚动后主按钮可达、激活页掩码/更换/零输入提交全部通过（`output/153-ui-report.json`）；`packagedRuntime: PASS`、`softwareLicense.gate=true`；GitHub 资产、官网整包与 Range 206、三份 Ed25519 清单、2.8.152→2.8.153 软件内更新全部核验通过。验收 `docs/release-verification-2.8.153.md`。

## 2.8.152：导演工作台短剧节奏梯度滑轨与整场时长精准重校准

- 用户需求：自动分段预计整场戏时长总体偏长（30 秒能拍完的戏常估到 35～39 秒导致分段过多）；要求结合短剧快节奏拍摄经验（长段环境/视觉描述在镜头前只是瞬间一瞥，台词按实际语速算）重设计时长划分，设立紧凑/适中/正常三档梯度，用横线滑轮（支持鼠标滚轮选择，越往左越紧凑、往右到顶最正常）调节，且界面必须结构合理、克制紧凑、空间利用率高。
- 根因与设计实现：
  1. `core/directorDurationPolicy.js` & `core/directorSceneBudget.js`：建立 `pace`（`0～100` 连续刻度，默认 `100` 兼容既有计划指纹）三档梯度——左端紧凑（中文 `6.0 字/秒`，起口 `0.18s`）、中段适中（`5.55 字/秒`）、右端正常（`5.1 字/秒`，替代原偏慢 `4.5 字/秒 + 0.5s/句`）；新增 `classifyEditorialBeat` 将转场词归零、说话前括号神态与台词重叠归零、长篇静态陈设/衣着/屏幕文字压为 `0.2～0.5s` 瞬间一瞥，并启用 `strictModelCap` 限制大模型估时膨胀（`1.05x～1.15x`）。
  2. `core/directorDialogue.js`：修复 `屏幕上显示：…` 与无 `△` 转场/动作行（`画面闪回`、`两人转身就走`、`一噎` 等）被并入对白字数的误差。
  3. `src/v06/DirectorQuickControls.jsx`、`DirectorBatchPanel.jsx`、`DirectorWorkspace.jsx`、`src/workspace-refresh.css`：实现等高 `30px` 横线滑轨 `DirectorPaceRail`（支持鼠标滚轮微调与拖动，单行内嵌于场景顶栏），并将 `原文/分段稿`、`整场预计秒数（实时随滚轮响应）` 与 `本轮已完成` 合并为单行状态条。
- 验证：真实《神明》`1-1` 从 `34s` 校准为正常 `27s` / 适中 `23s` / 紧凑 `20s`；全量测试 **3028/3028** 通过；真实 Electron 窗口 `1520px`/`1280px` 布局与滚轮事件实测通过；`packagedRuntime: PASS`，公开三份签名清单、官网整包及 Range 206、GitHub 资产与软件内更新核验全部通过。验收 `docs/release-verification-2.8.152.md`。

## 2.8.151：接口切换失效、LibTV 参考组合/参数兼容与 FT 音色上传修复

- 用户反馈与截图核实：用户已升级运行 `2.8.150`，在分镜工作台顶部“生成设置”点击切换接口后界面无反应（回弹 `LibTV · 视频`），同时顶部面板红字报“此模型不支持当前参考组合，请选择其他模型或调整参考”，单镜 `4-5-2` 在 LibTV 与 FT 直连上仍无法正常生成。
- 定位到的 5 层真实根因：
  1. **无法切换接口（2.8.150 回归）**：`core/generationReferences.js` 的 `normalizeGenerationReferences` 对非数组输入返回 `[]`，而 `GenerationComposer.jsx` 第 177 行 `change = patch => onChange(normalizeGenerationReferences({...value, ...patch}))` 把整个草稿/设置对象传入，导致每次改接口/模型/时长都发出 `onChange([])`，`profileId` 丢失回弹默认接口。
  2. **顶部默认设置面板误报“此模型不支持当前参考组合”**：真实 `Seedance 2.5`（`star-video2.5`）的 `modeType.items` 不含 `text2video`；顶部 `settingsOnly` 默认面板无 `references`（`[]`），`LibTVParameters` 对空参考推导 `text2video` 失败导致常驻误报。
  3. **批量下发 `image2video` 与带音频分镜冲突**：本地项目 17 集共 588 条分镜批量写入了 `libtvMode: 'image2video'`（其中 477 条同时含人物音色 `audio`），原 `libtvMode` 在非 `auto` 时原样返回 `image2video`，触发 `当前模式不支持这组参考素材`。
  4. **LibTV CLI `1.1.3` 参数字段名校验失败**：`libtv.exe` 按 Schema 属性的 `originalField` 校验 `-s` 参数，`Seedance 2.5` 的 `searchEnabled` 对应 `originalField: "search_enabled"`；原代码发 `searchEnabled=1` 触发 `Unsupported video parameter "searchEnabled"`。
  5. **FT 直连本地 `.flac` 音色无 MIME**：`electron/fnko-client.cjs` 本地扩展名映射漏了 `.flac/.aac/.mov/.gif`，导致 `.flac` 音色样本 `mime=undefined`，触发 `参考素材格式与类型不一致`。
- 修复：`normalizeGenerationReferences` 兼容草稿对象并保留全部非引用字段；`settingsOnly` 下 `LibTVParameters` 开启 `ignoreReferences`；`libtvMode` 在旧预设模式与分镜参考组合冲突时自动升级为模型支持的兼容模式（如 `mixed2video`），且 `libtvGenerationParams` 输出 `originalField` 键名；`fnko-client.cjs` 补齐 `.flac/.aac/.mov/.gif` 标准 MIME。
- 验证：全量测试 **3026/3026** 通过；真实 Electron BrowserWindow DOM 点击切换接口与拦截提交验证通过；真实 `4-5-2` 任务经 `libtv.exe 1.1.3` 参数预检通过（0 写入、0 付费）；公开三份 Ed25519 清单、官网整包 SHA256 与 Range 206、GitHub 资产 digest 及软件内更新全部核验通过。验收 `docs/release-verification-2.8.151.md`。

## 2.8.150：旧美术素材类型修复

- 用户问题：项目素材明明符合参数，LibTV 报“当前模式的参考素材数量不符合模型要求”，飞拓报“参考素材类型无效”，多个接口都无法生成。
- 证据：`D:/行舟影视/画布素材/generation-jobs.json` 最近 9 个失败任务中 7 个的 `references[].kind` 为旧存储类型 `asset-image`；真实任务有 3 张美术图 + 1 段音频，Seedance 2.5 明确允许 `mixed2video` 最多 50 项、图片 30 张。
- 根因：旧草稿/分镜把美术资产图以内部 `asset-image` 类型持久化，生成端只认 `image/audio/video`。LibTV 计数为 0 后报数量错误；飞拓在付费前校验报类型无效。不是素材参数、不是网络。
- 修复：新增统一 `normalizeGenerationReferences`，在草稿加载、LibTV 模式计算、统一生成队列提交前把 `asset-image` 恢复为 `image`；保留 assetId/imageId/顺序，修复分镜保存时的重复引用风险。
- 验证：真实失败任务数据重放得到 `mixed2video`、4 项参考、模型 Seedance 2.5；新增迁移、LibTV、Fnko 队列回归；全量 **3022/3022**。
- 事实边界：2.8.149 修的是 LibTV 四域名全量预检断连和大项目保存；本问题是它后面的另一层旧数据约定缺陷，不是同一根因。

## 2.8.149：大型项目协作保存修复

- 用户问题：项目协作里“神明”等大型项目持续提示“云端未确认本次保存”，其他读取正常；多次调整网关、物理分流、TUN 均无效。
- 根因：`cloud-backend/src/server.cjs` 把请求体上限写死为 16 MiB，超过后直接 destroy。真实“神明”项目单次导演同步约 **17.6 MB**，因此被断连；客户端把 502 HTML/断连统一显示成网络或未确认保存。
- 复现证据：无账号、无写入的 12 MB 请求返回正常 JSON 401；16/18 MB 返回 Nginx 502 HTML；18 MB 未压缩请求耗时约 54 秒。
- 修复：云端上限提升至 64 MiB；超过上限返回明确 JSON 413；超过 1 MiB 的客户端请求自动 gzip 压缩，服务端限制压缩前后 64 MiB 并解压。
- 真实验证：临时协作项目写入 300 万字符，保存 680 ms，回读长度一致，已删除；压缩 18 MB 请求公开网络 348 ms 返回 401。真实“神明”项目只读，未改写。
- 回归：`cloud-backend/test/server.test.cjs`、`server-large-payload.test.cjs`、`electron/cloud-timeout.test.cjs`、`electron/libtv-network.test.cjs`；全量 **3018/3018**。
- 云端部署：`server.cjs` 已备份并部署，备份 `/opt/xingzhou-backups/large-project-2.8.149-20261111T131532Z`，服务 active。
- LibTV：确认原实现要求四个官方域名全部预检成功，任一辅助域名（如 `bridge.liblib.art`）瞬时时超时便整体报“LibTV 网络连接失败”。现改为只剔除失败域名、保留可用线路，实际使用该域名时再按需探测。当前网络连续 5 次真实账号只读此前均成功；故障注入回归已覆盖单域名超时不再阻断账号连接。
- 发布核验：官网镜像、GitHub 资产、三份 `latest.json` 均已为 2.8.149；公开整包 SHA256 一致、Range 206 首 64 KiB 一致、三份 Ed25519 清单验签通过、2.8.148→2.8.149 软件内更新检测通过。验收 `docs/release-verification-2.8.149.md`。

## 2.8.148 已完成内容

1. 修复安装包漏装 11 个项目协作运行模块，避免项目列表、分镜素材和 WorkBuddy 初始化中断；打包清单和最终 ASAR 均做完整性核验。
2. 完整移除“网络分流”、TUN 兼容、物理网卡/DNS 选择及相关 IPC；云端、COS、素材和更新恢复原系统网络与代理行为。
3. 保留固定证书备用、安全 CONNECT、写入结果不明确时不重放等保护。
4. 全量测试 **3010/3010**、构建、三档真实 React 界面、NSIS 实际启动、项目列表及 WorkBuddy 真实 IPC 回归通过。
5. 当前系统网络下真实只读 17 集项目成功；未改写真实项目、未付费生成、未修改 Clash/TUN/系统代理。
6. 官网整包、GitHub digest、三份 Ed25519 清单及 2.8.147 正式更新检测通过。

- 安装包大小：104,017,644 字节。
- SHA256：`f354e52c9d474e3bcdd7ebdb731aecf8ac3300de90fdd57895c0e1b3b7032bc7`。
- Release：441610147。
- 官网：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.148.exe
- GitHub：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.148/Xingzhou-Film-Tencent-Setup-2.8.148.exe
- 本机安装包：`D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.148/Xingzhou-Film-Tencent-Setup-2.8.148.exe`
- 验收：`docs/release-verification-2.8.148.md`。

## Hermes 后续工作规则

- 用户的新需求默认由 Hermes 直接完成架构、实现、验证和发布，不停在建议阶段；只有用户明确说“只做方案”时才不修改软件。
- 每次开始先读取 `AGENTS.md`、`docs/开发交接手册.md`、本文件和 `C:/Users/11599/Documents/ChatGPT/行舟影视/软件更新记忆.md`，再检查当前 Git 状态和公开版本。
- 每个重要阶段都在本文件追加日期、需求、实际修改文件、测试证据、提交、发布状态和未完成事项；完成后同步 `docs/开发交接手册.md`、对应验收记录和外层 `软件更新记忆.md`。
- 不覆盖或清理不属于当前任务的未提交修改、未跟踪文件、用户数据和其他 worktree。
- 不记录或输出 API Key、GitHub 凭据或云端秘密。
- 未经用户明确需求，不为“保持进度”而制作空版本。下一版本号及功能由实际任务决定。

## 当前待办

- 2.8.154 已完成并公开发布；用户在软件内检查更新或运行安装包即可升级到2.8.154。未替用户强关/安装当前运行客户端。
- Codex 接手时，从本文件和最新实际代码继续，不需要重复 2.8.149–2.8.153 已完成的保存、LibTV、接口切换、参考素材兼容、导演短剧节奏梯度滑轨、注册页滚动与卡密记住工作。
- 并行静态审查另发现几项与本次“网络失败”无关的协作写入契约线索，尚未实施、尚未复现，不得直接当结论：成员删除/改角色可能按 `memberId` 与 `userId` 错位；`task-update` 可能被 `upsertTask()` 当成新增；美术协作者创建资产/替换清单可能被仓储层限制为所有者。若用户再报成员、任务或素材权限问题，先写失败测试复现再修。
