# 已配置图片接口完整排查（2026-10-15）

用户明确授权使用软件内已有接口和密钥进行真实测试。当前版本2.8.36，基线6e55ffc；修复版本2.8.37。未改真实项目、未更换用户API配置；新建的远端画布仅承载本次测试静物。

软件实际可选项来自12个非LibTV图片配置、LibTV型号目录和通过已有飞拓密钥自动出现的8个图片选项。非LibTV的20项全部逐一调用完成。用户随后要求“Lib TV的其他生图的不用试了”，已停止LibTV测试队列；仅查询、保存停止时已提交的原任务，不再创建或运行新任务。未测LibTV型号不标记通过。

## 主要结论

- LibTV：确认两处客户端适配错误，已修复并真实验证Pro/Fast出图和下载。无需重新接密钥。
- 龙：四个已保存型号中，gpt-image-2-2k成功，其余三项本轮收到524；不能概括成整站所有型号不可用。该2k型号本轮实际输出1280×720，名称不能当作分辨率保证。
- 志：四个已保存图片配置均复现477。
- W：三个已保存图片配置均返回400通用错误，前一轮绕过行舟、改变尺寸和使用最简请求也失败；内部原因仍被服务商隐藏。
- 本地Hunyuan：模型目录存在不代表支持图片协议。当前WorkBuddy代理没有POST /v1/images/generations（405）；携测试图片改走它已有的chat/completions仍503，明确返回该模型后端不支持/配置不完整，不能只靠客户端换路由解决。
- 飞拓：八个选项中2K/4K两个成功；普通异步和2.5两个上游任务失败；image2、nano-banana、nano-banana-2、nano-banana-pro四个上游明确已下架。

## 全部非LibTV配置逐项结果

| 配置/型号 | 结论 | 本次实际图片 | 耗时 |
| --- | --- | --- | --- |
| gpt-image-2.5-sunburst / gpt-image-2.5-sunburst | 上游477任务失败 | — | 6秒 |
| 志gpt-image-2 / gpt-image-2 | 上游477任务失败 | — | 6秒 |
| 龙-gpt-image-2-2k / gpt-image-2-2k | 已生成并保存 | 1280×720，1138590字节 | 32秒 |
| 龙-image-studio / gpt-image-2 | Cloudflare 524超时网页 | — | 126秒 |
| Hunyuan Image Alpha Edit / cn:hunyuan-image-alpha-edit | 图片路由405；直连聊天路由另返回503，Backend [hunyuan-stream] is not supported | — | 0秒 |
| W-GPT Image 2 / gpt-image-2 | 上游400 request_failed，内部原因未公开 | — | 5秒 |
| W-GPT Image 2.5 Flare / gpt-image-2.5-flare | 上游400 request_failed，内部原因未公开 | — | 4秒 |
| 飞拓 · image2 参考生图 / ft-image-v1-f8adc2592e629c78741d2f34a2d27115 | 上游明确下架 | — | 1秒 |
| 飞拓 · 异步 gpt-image-2 / ft-image-v1-b25e714310107175abcc98c4098298f2 | 任务处理失败 | — | 44秒 |
| 飞拓 · 异步 gpt-image-2 2K / ft-image-v1-d45fd3842e5079ee21665888db69f2e2 | 已生成并保存 | 2560×1440，4185466字节 | 66秒 |
| W-GPT Image 2.5 Sunburst / gpt-image-2.5-sunburst | 上游400 request_failed，内部原因未公开 | — | 3秒 |
| 志gpt-image-2.5 / gpt-image-2.5 | 上游477任务失败 | — | 6秒 |
| 志gpt-image-2.5-flare / gpt-image-2.5-flare | 上游477任务失败 | — | 6秒 |
| 龙-image-2.5 / gpt-image-2.5 | Cloudflare 524超时网页 | — | 126秒 |
| 飞拓 · 异步 gpt-image-2 4K / ft-image-v1-5d5f9502cca8487b0a81210c9b76fc75 | 已生成并保存 | 3840×2160，8570281字节 | 53秒 |
| 飞拓 · gpt-image-2.5 / ft-image-v1-5643c00d4116f22d1abb7d480dee4f68 | 图片生成上游任务失败，请稍后重试或联系管理员。 | — | 88秒 |
| 飞拓 · nano-banana / ft-image-v1-b87d4d06a1a007a11198413608450b91 | 上游明确下架 | — | 1秒 |
| 飞拓 · nano-banana-2 / ft-image-v1-c77f458ef2701fbb8ae2ed80bfedb7b5 | 上游明确下架 | — | 0秒 |
| 飞拓 · nano-banana-pro / ft-image-v1-74d4dfbdf0ee6d78c8683dc14c528f04 | 上游明确下架 | — | 0秒 |
| 龙-2.5-sunburst / gpt-image-2.5-sunburst | Cloudflare 524超时网页 | — | 126秒 |

## LibTV根因与修复

官方CLI 1.1.3创建画布返回 `{projectMeta:{uuid:...}}`。旧代码仅检查顶层projectUuid/uuid及部分data字段，误报“画布创建未确认”，实际上未提交付费生成。修复兼容真实返回结构并保留旧结构。

官方 `model <编号>` 详情可能把查询编号回显到modelName；`node -s model=...`却只接受 `model search --type image`里的显示名称。原代码误传编号，创建节点会被拒绝。修复从当前账号/空间和模型类型对应的官方目录取得显示名称，并在刷新、断开、切换空间时同步更新缓存；无法确认名称仍在提交前停止。

修复未更改登录凭据、账号隔离、原任务身份检查、单次运行与下载恢复规则。实际使用系统safeStorage和同一用户已有授权，仅把密文及所需系统加密状态复制到隔离测试目录；不记录或输出明文凭据。

Pro（lib-image-2.5-s）与Fast（lib-image-2.5-f）均已真实生成并保存2048×1152图片，已目视检查Fast结果。其他LibTV型号按后续停止指令不再继续测试，不要求用户等它们验证。停止时已支付的任务只读查询原节点保存，不重复运行。

## 按用户要求移除已下架型号

用户随后要求自动去掉本机已经下架的型号。本次删除内置目录中四个被服务商明确返回“已下架”的旧飞拓ID：image2参考生图、nano-banana、nano-banana-2、nano-banana-pro。它们也均不在本轮读取的当前上游图片目录中。同名新型号可能使用另一个ID，按ID判断，不按名称误删。

检查用户本地API配置和缓存目录，没有这四个旧ID残留；失效选项来自客户端内置表。本次更新从该表删除四项，应用2.8.37后不再从已有密钥重新出现。龙、志、W和本地Hunyuan已保存型号及缓存目录当前都能在各自模型列表找到，保留。所有生成图片、未完成任务和历史账目保留。

证据：output/image-retirement-current-catalog-check.json、output/image-ft-current-directory.json及core/feituoRetiredImages.test.js。隔离测试目录里的临时凭据密文及复制的系统加密状态已清理，正式LibTV连接未改。

## 失败与扣费边界

龙前一轮请求已确认存在前端126秒524、后台162秒成功计费0.04美元的情况。服务商可能在客户端断开后继续重试，收到超时不要直接重复批量生成；按请求ID核对原结果。不能仅凭本机报错宣称未计费。

本轮飞拓两次成功响应各显示costYuan=0.200。其余站点/LibTV按各自账号记录计费；本报告不把接口错误当作退款或零扣费保证。

## 使用建议

更新2.8.37后，在原美术卡片选择LibTV · 图片的Pro或Fast，直接生成；已有连接可沿用。另可选择本轮验证成功的龙-gpt-image-2-2k，或飞拓“异步gpt-image-2 2K/4K”。顶部批量模型如果显示“接口已移除”，需手动重新选择有效配置，这与单张卡片选择独立。

上游可用性为本次测试时点结果，单次成功不代表全天稳定，也不代表任何人物/参考/审核要求都已验证。测试图为茶杯静物，没有向服务商发送用户剧本或真实项目图片。

## 证据

- output/image-all-configured-live.json：20项完整请求/响应摘要、任务ID、结果路径和SHA256。
- output/image-all-hunyuan-chat-test.json：Hunyuan真实聊天协议对照及原始后端错误。
- output/libtv-live-audit/audit.json与相关stdout：官方画布/模型/节点实际契约取证。
- output/libtv-all-image-live/results.json、results/generation-jobs.json：LibTV真实测试任务和停止前结果。
- electron/libtv-live-contract.test.cjs：真实结构、显示名称、刷新恢复与提交前阻断回归。
- docs/image-api-incident-2026-10-15.md：前一轮三站日志、524和延迟计费详证。
