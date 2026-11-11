# 行舟影视 2.8.151 验收记录

日期：2026-11-12
主题：修复生成设置无法切换接口、LibTV 参考组合误报、CLI `originalField` 参数映射及 FT 本地 FLAC 音色上传

## 用户现象

1. 升级到 `2.8.150` 后，在分镜顶部“生成设置”面板以及单镜生成面板点击切换“生成接口”下拉框（如从 `LibTV · 视频` 切到 `FT直连` / `Muse API`）毫无反应，界面立刻回弹到原接口。
2. 顶部“生成设置”默认面板红字报错：`此模型不支持当前参考组合，请选择其他模型或调整参考`。
3. 单镜（如第 4 集 `4-5-2`）携带美术图 + 人物音色参考时，LibTV 仍报参考组合/模式不符，或提交到 LibTV CLI `1.1.3` 报参数错误，切到 FT 直连也报“参考素材格式与类型不一致”。

## 证据与全部真实根因（共 5 层）

1. **`GenerationComposer.jsx` 状态破坏导致无法切换接口（2.8.150 引入回归）**：
   - `2.8.150` 在 `core/generationReferences.js` 新增的 `normalizeGenerationReferences(references)` 写成 `(Array.isArray(references) ? references : []).map(...)`，传入非数组对象时直接返回空数组 `[]`。
   - 而 `src/v06/GenerationComposer.jsx` 第 177 行写了 `const change = patch => onChange(normalizeGenerationReferences({ ...value, ...patch }));`，把整个草稿/设置对象传给了该函数，导致任何下拉变更都把 `[]` 传给父组件，`([]).profileId === undefined`，受控 `<select>` 立即回退到默认接口 `activeVideoApiId`。
2. **顶部“生成设置”默认面板无参考素材导致 `Seedance 2.5` 误报红字**：
   - 真实 `Seedance 2.5`（`star-video2.5`）的 `modeType.items` 为 `['singleImage2video', 'frames2video', 'image2video', 'mixed2video']`，**不包含 `text2video`**（该模型必须至少带 1 个参考素材）。
   - 顶部 `settingsOnly` 默认生成设置面板本身没有 `references`（为空数组 `[]`），`LibTVParameters` 直接用 `[]` 调 `libtvMode(model, [], 'auto')` 推导 `text2video` 失败，从而在默认面板常驻误报 `此模型不支持当前参考组合，请选择其他模型或调整参考`。
3. **批量下发的 `libtvMode: 'image2video'` 与带音色分镜冲突**：
   - 用户本地项目全部 17 集共 588 条分镜在批量应用设置时写入了 `generationConfig.libtvMode: 'image2video'`（其中 477 条同时带有已采用的人物音色音频 `audio`）。
   - 原 `libtvMode` 在 `chosen !== 'auto'` 时直接原样返回 `'image2video'`，随后 `libtvGenerationParams` 第 44 行因 `/image|frames/.test('image2video') && count('audio') > 0` 抛错 `当前模式不支持这组参考素材`。同时原 `options` 在 `image + audio` 并存时还误把纯音频 `audio2video` 列入了候选。
4. **LibTV CLI `1.1.3` 参数名要求使用 Schema `originalField`**：
   - 逆向核实本机 `libtv.exe`（`1.1.3`）的 `validateGeneratorParamsPatchAgainstSchema` 与 `hoistSchemaGroupedParamsFromTopLevelPatch`：CLI 对 `-s key=value` 校验的是属性自身的 `originalField`（例如 `Seedance 2.5` 中 `properties.searchEnabled` 的 `originalField` 为 `"search_enabled"`）。
   - 原 `core/libtv.js` 直接发送属性键名 `searchEnabled=1`，触发 `libtv.exe` 报错 `Unsupported video parameter "searchEnabled"`（真实失败任务 `jobId: 44ea4a17-aa95-4b16-b62c-dfab51335b4f` 记录在案）。
5. **FT 直连本地音色 `.flac` 缺少 MIME 映射**：
   - 用户项目人物音色样本保存在本地 `media/*.flac`。`electron/fnko-client.cjs` 的本地文件扩展名表原先只写了 `.mp3/.wav/.m4a/.ogg`，漏掉了 `.flac/.aac/.mov/.gif`，导致 `mime` 为 `undefined`，上传前校验报 `参考素材格式与类型不一致`。

## 修复内容

- `core/generationReferences.js`：`normalizeGenerationReferences(value)` 兼容数组与草稿对象——传入数组时返回归一化后的数组；传入含 `references` 属性的对象时保留原对象全部字段（`profileId`、`model`、`prompt`、`ratio`、`duration` 等）并仅归一化 `value.references`；其余对象原样返回。
- `src/v06/LibTVParameters.jsx` & `src/v06/GenerationComposer.jsx`：为顶部 `settingsOnly` 默认设置面板传入 `ignoreReferences`，不在无素材的全局默认面板上对单镜参考组合报错。
- `core/libtv.js`：
  - 当分镜保存的 `chosen` 模式（如批量下发的 `image2video`）与当前分镜实际参考素材组合冲突时，若模型支持兼容该参考组合的模式（如 `mixed2video`），自动升级为兼容模式；且 `audio2video` 仅在纯音频（无图片、无视频）时参与候选。
  - `libtvParameters` 提取 `cliKey = prop.originalField || key`，`libtvGenerationParams` 统一输出 `params[property.cliKey]`（如 `search_enabled=1`），兼容旧自定义键读取。
- `electron/fnko-client.cjs`：本地参考文件读取补齐 `.flac -> audio/flac`、`.aac -> audio/aac`、`.mov -> video/quicktime`、`.gif -> image/gif`，并兜底读取 `ref.mime`。

## 测试与真实验证

- 单元测试与 SSR 回归：`core/generationReferences.test.js`、`core/libtv.test.js`、`electron/fnko-client.test.cjs`、`electron/generation-composer-regression.test.cjs`。
- 全量测试：**3026/3026** 全部通过（`output/151-tests.log`，0 失败）。
- 真实 Electron BrowserWindow DOM 交互验证（`output/151-dom-result.json`）：
  - 默认设置面板挂载 `Seedance 2.5` 时 `alertsBefore: []`（无误报红字），点击 `<select aria-label="默认生成接口">` 切换到 `ft-video` 后 DOM 值与 React state 立即变为 `ft-video`（`isDefaultsArray: false`）。
  - 单镜面板携带 `asset-image` + `image` + `.flac audio` 且预设 `libtvMode: 'image2video'` 时无报错，拦截提交回执确认参考类型归一化为 `['image', 'image', 'audio']`，点击切换单镜接口到 `ft-video` 后保留全部 3 项参考素材且成功切换接口。
- 真实 `4-5-2` 任务 + `libtv.exe 1.1.3` 参数预检（无画布写入、0 付费）：
  - 用真实 `xingzhou-data.json` 的 `Seedance 2.5` Schema 与真实 `4-5-2` 任务运行 `libtvGenerationParams`，自动升级为 `modeType=mixed2video` 并输出 `search_enabled=1`。
  - 传入本机 `libtv.exe 1.1.3`（指向不存在的空项目 ID `00000000000000000000000000000000` 以确保零画布写入、零计费），CLI 本地 Schema 参数校验 100% 通过，不再报 `Unsupported video parameter`，直接进入远端画布查询返回 `10051 project not found`。

## 构建与公开发布核验

- 安装包：`release/2.8.151/Xingzhou-Film-Tencent-Setup-2.8.151.exe`
  - 大小：**104,037,165 字节**
  - SHA256：`a9ba6986c013e8197a88d47bcf796989cdf5740e2e7470fd14e8427f4452df62`
  - `packagedRuntime: PASS`
- `win-unpacked/resources/app.asar`：
  - 大小：`22,684,080 字节`，SHA256：`8e86163a29bbe495221902464369f3f8acc64fd95b7d13340196040ed8984d57`
  - 解包核验 `package.json` 为 `2.8.151`，且包含对象安全的 `normalizeGenerationReferences`、`originalField + modeRejectsReferences` 与 `audio/flac`。
- GitHub Release：`v2.8.151`（Release ID `442088045`），资产 `uploaded`，大小 `104,037,165`，digest `sha256:a9ba6986c013e8197a88d47bcf796989cdf5740e2e7470fd14e8427f4452df62`。
- 官网镜像：`https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.151.exe`（整包下载 SHA256 一致，Range `206` 首 64 KiB 逐字节一致）。
- 清单与软件内更新：官网及双 GitHub 仓库共三份 `latest.json` 完全一致并通过 Ed25519 签名校验；`output/review-151/check-update.cjs` 实测正式更新源返回 `2.8.151`（支持从 `2.8.150` / `2.8.149` 升级）。
- 本机状态：未强制关闭用户正在运行的客户端进程（当前运行进程仍为 `2.8.150`），用户在客户端内点击检查更新即可平滑升级到 `2.8.151`。
