# 行舟影视 2.8.150 验收记录

日期：2026-11-11
主题：旧美术素材类型导致生成接口误判

## 用户现象

- 素材本身符合模型参数，LibTV 报“当前模式的参考素材数量不符合模型要求”。
- 飞拓等其他接口报“参考素材类型无效”，切换多个接口仍无法生成。
- 前期曾表现为 LibTV 网络失败；2.8.149 修网络后，请求进入下一层校验，暴露出本问题。

## 证据与根因

- 真实任务记录：`D:/行舟影视/画布素材/generation-jobs.json`。
- 最近 9 个失败任务中 **7 个**的 `references[].kind` 为旧内部存储类型 `asset-image`。
- 失败任务实际参考：3 张美术资产图 + 1 段音频，共 4 项。
- Seedance 2.5 实际模型参数：`mixed2video: [1,50]`、`imageMax:30`、`audioMax:10`，用户的 3 图 + 1 音频完全合法。
- 生成端只接受 `image/audio/video`：
  - LibTV 只统计 `kind==='image'`，旧类型被算成 0 张，触发数量错误；
  - 飞拓在付费提交前检查类型，直接报“参考素材类型无效”。
- 结论：不是素材尺寸、格式、数量、网络或账号问题，是旧草稿素材类型未迁移。

## 修复

- 新增统一 `normalizeGenerationReferences`：将带 `assetId/imageId` 的 `asset-image` 恢复为生成接口标准类型 `image`，保留 `assetId`、`imageId`、顺序和其他字段。
- 应用位置：
  - 生成界面加载与预览；
  - 分镜素材刷新；
  - LibTV 模式与参数计算；
  - 统一生成任务队列入口，覆盖 LibTV、飞拓、9Y、MaxForAI、AutoDL 等所有经过该队列的视频接口。
- 同时规范化分镜生成完成后的合并，避免旧引用与新引用重复。

## 回归

- 新增旧素材类型迁移测试、刷新迁移测试、LibTV 真实模式计算测试、统一视频队列迁移测试。
- 真实失败任务数据重放：原 4 项参考（3 图 + 1 音频）现在得到 `mixed2video`、4 项参考、模型 Seedance 2.5，不再报错。
- 全量测试：**3022/3022** 通过，记录 `output/150-tests.log`。
- `npm run build` 通过。

## 发布核验

- 安装包：`release/2.8.150/Xingzhou-Film-Tencent-Setup-2.8.150.exe`，**104,034,096 字节**，SHA256 `442442c963cceee0437c773e78fa8ec9289382192c82ee47503f067812d9db5e`。
- 打包运行时 `packagedRuntime: PASS`；最终 ASAR 已核验 `core/generationReferences.js`、`core/libtv.js`、`electron/generation-jobs.cjs` 均包含素材类型迁移。
- 官网/GitHub 下载、三份签名清单、软件内更新和本机安装一致性在发布后补充。
