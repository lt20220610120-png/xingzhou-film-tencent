# 2.8.84 发布验收

日期：2026-10-27。基线：2.8.83 / d0a8079。来源：用户要求缺项按钮同行靠右、待处理面板可折叠、移除解释文字、增加两个一键入口并汇总全剧未确认项。

## 实现与边界

- ArtReviewSection 使用所选提示词版本的 wholeBatch.pendingMissing，独立于当前集/场景和整场/提示词显示模式。PromptMissingBatchPanel 默认收起，显示全剧数量；提供所选/全部批量确认和逐项确认，返回补充定位到目标集场并切换整场模式。
- resolvePromptMissingReferences 使用一次 service.mutate / CAS，逐项验证所见签名，确认后保存 locked/excluded/skipReference。既有人工核实审计与发布流程保留；未选项继续阻止对应范围，不自动核实或发布。
- 正在分发的目标拒绝处理，其他已完成条可独立处理；当前来源在等待写入时变化拒绝整批，明确选择的历史版本保持独立。过期签名缺项不列入可确认列表。
- 当前提示词缺项按钮与名称同行靠右；全剧面板内部列表限高滚动，移除解释副文案。

## 验证证据

- npm test：2457/2457 通过，0 失败、0 跳过；output/test-2884.log。
- 新增 core/promptMissingBatch.test.js：跨集原子确认、选择隔离、空/过期/运行中拒绝、等待写入时来源变更拒绝。实现前及复核修正前均观察到对应 RED，修正后 GREEN。
- 独立复核发现来源版本在写入前变化时可能误改已归档版本；增加 followedCurrent 检查和竞态回归，定向 11/11 通过。
- scripts/verify-prompt-missing-batch-ui.cjs：1280/1700/2232 三宽通过；检查全剧 6 项、默认收起/展开、选择仅影响所选、切集保持全剧计数、跨集返回场景、全部确认只保存一次、不自动发布、恢复核实按钮。output/playwright/prompt-missing-2884.json 及对应截图。
- scripts/verify-model-pipeline-ui.cjs：1280/1700/2232 三宽既有链路回归通过；并发上限 6、信息读取停止后下游继续、独立清单分发启停、场/集/剧发布、美术提示词关联和同行构图均通过；output/pipeline-ui-2884.log。
- npm run build：通过；output/build-2884.log。
- node scripts/package-release.cjs：NSIS 与实际安装包运行时 PASS；qa/packaged-smoke-2.8.84-1793083027219，output/package-2884.log。测试使用模拟模型，未进行真实付费生成。
- 安装包 103854324 字节；SHA256 e1dffc188af59e76335a958c318342840b122d31ee07f628aca929e33c00d814。

## 发布地址

- https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.84.exe
- https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.84/Xingzhou-Film-Tencent-Setup-2.8.84.exe

## 公开发布复核

- 源码提交 06c61d7 已推送至 codex/monthly-license-legacy-exemption。
- GitHub Release v2.8.84 已上传；asset digest、大小与本机一致。
- 官方镜像发布端验证完整文件 SHA256 与大小后原子发布。
- updates 仓库、tencent 仓库和官方镜像三份 latest.json 完全一致，Ed25519 签名验证通过。
- 公开镜像下载 bytes=0-1023 返回 206 / 1024 字节，MZ 文件头、Content-Range 和总长符合本机文件。
- output/verify-release-2884.py 输出 passed: true；记录 output/playwright/public-release-2884.json。
