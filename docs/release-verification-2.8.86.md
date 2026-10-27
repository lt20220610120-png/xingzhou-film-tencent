# 2.8.86 发布验收

日期：2026-10-28。基线：2.8.85 / a0aefd5。来源：用户反馈全剧提示词核实与发布按钮置灰，希望快速浏览后批量处理已完成部分。

## 实现

- `promptReviewState` 为每条提示词保留局部问题并输出 `reviewableEntries`。全局范围在存在未完成集时不再把所有已完成条目一起锁死；真实待补、空提示词、模型分发中和来源变更仍不进入可核实集合。
- `reviewPromptScope` 对全局范围使用当前可核实集合，一次保存核实记录、按集更新场景核实并发布；本集/本场范围继续使用严格全部完成门禁。全局发布只发布已核实的可用集合，剩余集可以稍后再次点击处理。
- UI 全剧按钮以 `reviewableEntries` 和忙碌状态为条件，按钮 title 保留具体待处理原因；全局发布以可核实集合的已核实数量判断，不要求整部剧其他待处理集先完成。

## 验证

- 新增回归：全剧 3 条已完成提示词 + 后续集 1 条未完成时，核实全剧和发布全剧一次完成前 3 条，后续条目保留待处理。
- npm test：2468/2468 通过，0 失败/跳过；output/test-2886.log。
- verify-model-pipeline-ui.cjs：1280/1700/2232 三宽通过；验证未分析前不发请求、最大并发 6、停止信息读取不取消下游、现有场/集/剧发布和美术提示词关联。output/pipeline-ui-2886.log。
- verify-prompt-missing-batch-ui.cjs：三宽通过；全剧待处理折叠、选择/全部确认、跨集跳转和发布流程继续通过。output/pending-ui-2886.log。
- npm run build 与 node scripts/package-release.cjs：NSIS/实际运行时 PASS，qa/packaged-smoke-2.8.86-1793119244336，output/package-2886.log。
- 安装包：103858494 字节；SHA256 6e9cd7159fa17256dd3ea4d3a86fb133d2152be60975cb8f923050e6db2d05f0。

## 发布地址

- https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.86.exe
- https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.86/Xingzhou-Film-Tencent-Setup-2.8.86.exe

## 公开发布复核

- 源码 d1fe036 已推送至 codex/monthly-license-legacy-exemption；GitHub Release v2.8.86 已上传。
- GitHub asset digest、大小与本机一致；官方镜像发布端验证完整文件 SHA256 后原子发布。
- updates 仓库、tencent 仓库和官网镜像三份 latest.json 完全一致，Ed25519 签名通过；公开 Range bytes=0-1023 返回 206、1024 字节，MZ 文件头及 Content-Range 总长正确。
- output/verify-release-2886.py 输出 passed:true；记录 output/playwright/public-release-2886.json。
