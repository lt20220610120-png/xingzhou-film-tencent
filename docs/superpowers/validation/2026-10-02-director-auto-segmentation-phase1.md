# 导演自动分段第一阶段验收记录

执行日期：2026-10-02。用户已要求执行原方案。本轮范围为单场景；整本批量仍由单场景真实试用确认后启动。

## 实现与证据

| 验收项 | 实现与检查 |
|---|---|
| 40 秒、30 秒上限得到 30+10 | core/directorSegmentation.test.js、directorQuickGeneration.test.js、directorQuickStore.test.js；浏览器模拟也得到两个对应徽标 |
| 150 秒的 15/30 秒对照 | directorSegmentation.test.js：受控锚点得到 10/5 段 |
| 不在 5 秒处提前切、短场约 8 秒 | 非尾段 85% 窗口与短尾段测试；浏览器短场显示 8 秒 |
| 长台词和原文完整覆盖 | 精确单元/前缀锚点、Unicode 安全、严格拼接覆盖；台词来源与顺序检查 |
| 完整 Skill 及场景预演上下文 | directorSegmentationMessages.test.js、skillAiExecution.test.js；每次完整 Skill 文件和只读整场参考，最后仅提交当前括号 |
| 状态衔接、光影基准、输出合同 | directorPromptValidation.test.js；fast-v8 合同、光影一致、台词归属与结构化语义审核 |
| 非法秒数、真实超时、不可容纳内容 | 1～30 整数限制；准确十进制计时拒绝 30.01；来源证据容量问题，不提高上限 |
| 失败、暂停、晚回包、恢复 | directorQuickRecovery.test.js；首次 checkpoint 停止、旧回包忽略、固定 ID、复用规划/首条基准、有限修正 |
| 提交与历史、删除不复活 | directorQuickStore.test.js、directorQuickPersistence.test.js；整场原子 reducer、固定 ID 幂等、墓碑、指纹核对 |
| 账号隔离、保存竞争、目录迁移 | electron/director-quick-checkpoints.test.cjs、core/directorPersistence.test.js；原子 checkpoint、串行两份存储、迁移校验保留源文件 |
| 总剧本重解析、云合并 | directorEpisodeReconcile.test.js、directorQuickPersistence.test.js；唯一身份匹配、歧义不按位置继承、活动计划冲突显式显示 |
| 导出重导入、编辑待复核 | promptTiming.test.js、directorQuickPersistence.test.js；独立元数据行与正文分离，历史与整本条目保留建议值 |

## 页面验证

使用 Playwright 及 output/playwright/director-auto-fixture.js 的隔离数据和模拟 API；未读写真实用户剧本、导入 Skill 或账号池，未调用付费接口。

- 在 1120×720、1500×940、2229×1316 检查并列、换行、生成按钮和建议时长，截图已查看。
- 自动/人工切换、1/15/30 秒选择、30+10 生成、8 秒短场、只读自动稿均通过。
- 第二条请求失败时正式结果数不变；继续只调用第二条和核对，正式结果只新增本轮两条。
- 停止后恢复、切 Skill 库返回、重新加载页面，结果和进度仍可找到。
- 编辑提示词后显示“时长待复核”；原文与派生括号稿分别保留。
- 模拟选择新资料目录后解除保存屏障，返回导演工作台再次生成成功；实际目录复制和拒绝覆盖由 checkpoint 迁移行为测试验证。
- 页面无应用运行错误；开发预览首次打开的 favicon.ico 404 不影响功能。

截图位置：output/playwright/director-auto-1120.png、director-auto-1500.png、director-auto-2229.png（忽略提交的本机 QA 工件）。

## 实现取舍与质量门槛

非尾段窗口取 85% 是首版策略。时长与衔接的语义判断由规划/核对模型完成，纯程序保证来源覆盖、时长结构和已支持的输出合同；模拟验证不能证明真实提示词或视频效果。

completed 检查点目前保留完整本地计划用于恢复查看，正式提示词与计划也进入项目历史；没有开启自动清除失败草稿。该规格中的 completed 回执压缩是可选优化。

真实试用建议：同一对白场景分别选 15/30 秒，检查动作/持物/光源衔接，再检查短场或短尾段。实际请求由用户点击生成。用户认可后再执行第二阶段，当前版本没有整本按钮或自动全剧任务。

## 工程与发布

发布版本：2.4.10。

- 最终 `npm test`：941 tests / 13 suites，全部通过，0 fail、0 skipped。
- `npm run build`：生产构建成功，1871 模块。
- Electron 主进程与 preload 语法检查、`git diff --check` 通过。
- 资料目录切换采用“选择目录 → 暂停/flush → 挂起保存 → 同步迁移及切换 → 合并最新快照 → 恢复保存”；包含挂起边界微任务和写失败后的恢复测试。
- 安装包运行时检查通过：版本、页面、preload bridge、本地图片/视频/音频、DOCX 导入及原有 WorkBuddy 模块加载。

公开发布已完成并核验：

- 更新仓库和源码仓库的公开 latest.json 均为 2.4.10，URL、文件大小和 SHA256 与本地已验证安装包一致。
- 安装包：`https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.4.10/Xingzhou-Film-Tencent-Setup-2.4.10.exe`。
- 文件大小：102348234 bytes。
- SHA256：`e3f09cde18cf73f5160146639c09dc40d5c40a23bf6610573209b11d32053d14`。
- 已从公开安装包下载地址完整读取文件并重算 SHA256；大小与哈希均匹配。核验报告在本机 qa/director-auto-public-release.json。
- 实现源码提交：57a65e0；公开更新清单提交：b9f2218。用户可在设置页检查并安装更新。
