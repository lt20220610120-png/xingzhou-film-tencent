# 2.8.159 协作流水线优化验收

日期：2026-11-13。源码基线2.8.158（11b6f32）；本版沿该工作区迭代，导演Skill正文规则不变。

## 范围

- p-queue10用于有界准备池，等待任务动态场景优先并按10秒增加等待权重；模型请求队列使用同一规则，5个后台槽位和第6个手动槽位保留。查看场景仅重排既有任务，不授权或新增AI调用。
- 清单后视觉工作与对白并行，提示词关联等待对白分支完成；取消/人工修改/版本来源检查继续保护落盘。跨集清单与外貌继承仍按既有顺序。
- 模型分发前先执行现有明确身份关联，仅保存confirmed结果，避免把未判定候选提前写为约束。其余交给模型；新Skill正文不做格式或比重自动改写。
- 清单/场景/已保存关联的当前有效成果计数；排队、等待响应、接收和保存阶段及阶段耗时、最近完成条目；缓存未变的核实统计。
- 全场描述就绪与最终核实发布门槛仍保留；本版未实现将未补描述无条件跳过的宽松关联策略，亦未加入对结果不明请求的自动重放。

## 验证

- 全量3074/3074，13组、0失败/取消/跳过，日志`output/159-tests.log`。用Python3.11和Node测试并发4保持已有WorkBuddy进程夹具环境；无跳过测试。
- `npm run build`成功，日志`output/159-build.log`。
- 新回归覆盖准备池优先级贯穿、模型优先级/手动保留槽位、等待加权、未知候选不前置落盘、明确结果0模型调用、正文变更后计数失效、对白未返回时视觉先推进且提示词未保存。既有停止/人工冲突/迟到结果/254条准备上限等回归继续通过。
- 真实隔离Electron/React界面：30条、后台峰值5；前5条已开始后切到1-3场景，第6条启动1-3-1；收包状态真实轮询模拟IPC，最终30/30保存。1280/1920无横向溢出。`output/159-ui/report.json`及截图。
- jev评分接口HTTP402不可用，不计作独立验证通过。源码、最终测试日志和界面证据已另行复核；未发真实收费模型请求、未改真实项目或系统网络。

## 打包与发布

- 实现提交`5f1d5bd`已推送。
- 最终包：`release/2.8.159/Xingzhou-Film-Tencent-Setup-2.8.159.exe`，104126673字节，SHA256 `b826266a75f12f20ad3b846ce782e40e8bb9eecf5b79de683223e8a50f38aa28`。
- 正式打包运行PASS：`qa/packaged-smoke-2.8.159-1794552251849/report.json`，30个运行依赖实物化打包。6份关键ASAR源码逐字节一致、p-queue10依赖存在，见`output/159-asar.json`。
- Release443903675正式公开，资产uploaded、大小与GitHub SHA256 digest一致；发布用Actions43381387887在GitHub侧重建并完整核对同一安装包后上传。
- 官网及两个raw main latest.json一致，Ed25519验签通过；官网公网Range206首64KiB逐字节一致，官网服务端实际HTTPS整包流SHA256一致。没有把公网客户端完整下载100MB列为本轮验证。见`output/159-public.json`、`output/159-official-service-sha256.txt`。
- 真实Electron更新弹窗154→159：仅一次清单检测，种入已验本机包的前缀，以真实HTTPS206补齐末64KiB，再做整包大小与SHA256校验并调用隔离安装回调。没有实际安装或关闭用户客户端。见`output/159-update-ui.json`、`output/159-update-ready.png`。
- 官网安装包：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.159.exe
- GitHub安装包：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.159/Xingzhou-Film-Tencent-Setup-2.8.159.exe
