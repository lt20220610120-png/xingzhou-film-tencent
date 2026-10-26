# 2.8.82 发布验收

日期：2026-10-27。基线2.8.81。来源：用户截图中的“模型输出被截断”及提示词分发效率要求。

## 实现

- 场景提示词分发和逐场对应请求显式设置 `analysisMode:true`。DeepSeek 分析请求关闭隐藏推理，输出预算用于最终 JSON，避免推理消耗预算后以 `finish_reason=length` 截断。
- 分发输入裁剪为【基础设定】人物/场景/道具索引、基础设定原文、少量包含实体名的用途提示、本场卡片和人工锁定项；不再重复发送整条提示词及四个长区块。基础设定仍由模型读取，卡片身份仍由场景清单提供。
- 模型只返回本条实际使用的卡片；省略项由程序标为 excluded，减少大场景输出量。证据只允许定位在基础设定 UTF-16 范围内，画面或对白中的属性不会成为身份依据。
- 分发输出预算按卡片数量动态计算，范围2048至8192；结构化服务商错误直接结束当前条目，不重复发送已付费的截断请求。人工锁定、版本、CAS、停止保护继续生效。

## 验证

- `npm run dist`：**2452/2452**通过，Vite、NSIS、实际安装包运行时PASS。日志 `output/dist-2882.log`，运行时 `qa/packaged-smoke-2.8.82-1793057209670`。
- 分发/基础设定回归42项通过；电子端错误包、DeepSeek分析模式与流传输测试18项通过。覆盖：无页面请求、分析模式开启、紧凑输入、禁区证据拒绝、部分卡片安全排除、截断错误不重复付费请求。
- 生产CSS真实组件三宽界面通过：`output/ui-2882-final.log`、`output/playwright/model-pipeline-2881.json`。已有并发、独立启停、场/集/剧发布检查继续通过。
- 最终安装包103852588字节，SHA256 `05cd433e686c5b3d5352694ca4b1d7cf459dc15a2fabb4864e2c780bcb47846a`。

## 发布

已正式发布，实现源码 `7adc5ea`。两处GitHub main与官网三份latest.json完全相同，Ed25519签名通过；GitHub资产digest、镜像发布端SHA256、大小与本机一致，公开Range下载206且MZ头和总大小正确。证据 `output/publish-2882.log`、`output/public-verify-2882.log`、`output/playwright/public-release-2882.json`。

- 官网：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.82.exe
- GitHub：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.82/Xingzhou-Film-Tencent-Setup-2.8.82.exe
- 本机：C:/Users/11599/Documents/ChatGPT/行舟影视/tencent/release/2.8.82/Xingzhou-Film-Tencent-Setup-2.8.82.exe
