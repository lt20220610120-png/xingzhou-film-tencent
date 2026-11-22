# 生图接口失败排查（2026-10-15）

> 后续按用户要求扩展测试全部已配置接口，确认龙2k型号、飞拓2K/4K可用，并找到且修复LibTV客户端适配错误。最新结论见[完整排查](image-api-full-audit-2026-10-15.md)。本文保留前一轮证据，不能据此认定所有型号都不可用。

## 结论与边界

本次失败主要发生在第三方图片服务或其上游通道，已有服务商原始日志和用户授权的真实对照测试支持。龙接口存在上游账号/货源不可用，以及处理超过Cloudflare时限的问题；志接口的截图请求已精确匹配到服务商通道失败，简单静物也复现477。W绕过行舟直接请求仍失败，但其公开错误不提供更底层原因，无法再细分内部故障。

第一阶段仅查询目录、状态、原有日志和空JSON参数校验。用户随后明确授权“我允许你调用API接口去测试”，第二阶段提交10次单张真实对照请求（龙1次、志4次、W5次），其中志1次在参数校验阶段被拒绝。客户端均未获得可保存图片；龙有1条延迟成功计费记录，详见下文。没有更改用户API配置、项目、缓存、客户端代码或安装包。本次并非所有已配置型号的全覆盖可用性测试。

## 基线与证据来源

- 客户端、工作区源码版本：2.8.36；Git HEAD `6e55ffc`，分支 `codex/ip-autonomous-recovery-2.8.36`。任务开始时仅有原有未跟踪 `docs/security-rating-2.8.4.md`、`output/`。
- 用户三张截图；实际本地配置只读核对；`electron/media-service.cjs`、`core/canvasStore.js`、`core/assetImageRecovery.js`、`src/v06/CollabWorkspace.jsx`、`src/v06/ModelSelect.jsx`。
- 使用用户已配置的各站点 Key，仅向其对应源站鉴权。Key 未输出、未复制至证据文件。
- 两个 New API 站点 `/api/log/token` 原有日志。时间下文均为北京时间；一条请求可能产生多条服务商内部重试日志，不能将日志行数当作用户生成次数。
- 三站 `/v1/models` 均 HTTP 200，用户配置的相关 GPT Image 型号均在各自目录中。目录成功仅证明鉴权/目录可用，不证明图片通道健康。

## 各接口结果

### 龙：newapi.dragon3api.com

10 月 15 日 03:45:24–04:45:14 的图片记录中，9 个独立失败请求对应 46 条错误记录：401 共20条、429 共1条、477 共3条、500 共8条、502 共7条、503 共7条。

服务商日志明确包括：`API key is disabled`、`No available compatible accounts`、当前分组货源冷却、`upstream error: do request failed`。同一已鉴权请求在服务商内部多次切换失败通道；这些401描述的是服务商转发后收到的上游错误，不能直接理解为用户填入行舟的 Key 已失效。

可供服务商定位的请求：`202610142040145572542028268d9d6D3Al2un5`，模型 `gpt-image-2.5`，日志结束04:45:14，处理时间300秒；同一请求同时出现401、503和500。

另有04:11:23的成功计费记录，模型 `gpt-image-2`，记录为 `Size 1280x720, Quality standard, Image count 1`；请求 ID `202610142008284473040618268d9d6NBmI0yAW`。这是成功计费记录，不独立证明客户端已下载并保存图片，但足以反驳“1280x720必然被这个接口拒绝”。

### 志：zhiqiapi.com

03:23:06–04:36:34共有16个独立图片失败请求，四种型号 `gpt-image-2`、`gpt-image-2.5`、`gpt-image-2.5-flare`、`gpt-image-2.5-sunburst` 均有记录。这16条为 `status_code=477`、`relay_outcome=failed`，请求路径 `/v1/images/generations`，记录额度为0。

截图中的请求 ID 可精确匹配：`202610142036284577712008268d9d6tk6dHcvn`，模型 `gpt-image-2`，04:36:34结束，处理5秒。其服务商日志已有所选通道信息，说明请求已进入第三方通道；公开错误被服务商统一隐藏为“请求处理失败”。不能由此认定具体为内容违规，也不能确认其内部账号失效或与其他站共用同一上游。

同站10月14日06:10:40仍有 `gpt-image-2.5` 的 `relay_outcome=success` 历史记录。公开状态里的旧故障/恢复公告不代表本次通道状态。

### W：wawapii.com

`/v1/models` 返回200，三种已配置型号在目录内。`/v1/usage` 返回 Key 有效、余额为正，当前 Key 的成功请求/消费统计为0。余额不足、Key无效或型号未在目录出现，均不符合本次只读查询结果。

直接向 `/v1/images/generations` 发送 `{}`（不含模型、提示词和参考图）返回400 `request_failed`，文案与截图“内容违规、参数错误或其他未知原因”的通用文案一致。这证明该文案本身不具备根因区分能力，不能拿它判断截图提示词违规，也不证明空请求与用户完整请求的内部失败原因相同。

空请求诊断 ID：`0bafd410-4b2a-4862-af03-5d4f28245429`。这不是截图原请求ID，不用于替代截图工单。网站使用日志接口需要网站登录凭据，API Key 调用返回401；未绕过鉴权，也未取得W截图原请求的内部日志。仍需W服务商按原请求时间/ID核对具体错误。

## 截图另外两处提示

- `图片接口请求失败（405）`：代码显示是请求收到HTTP 405后、响应JSON中没有可显示message时的兜底错误；客户端实际发送的是POST。原请求没有保存HTTP头/完整响应和请求ID，本次日志也未找到405，不能武断确定是上游方法限制、内部转发还是重定向造成。
- `接口返回异常：<!DOCTYPE html>...`：来自JSON解析收到HTML后的错误分支。第二阶段已在龙接口复现相同HTML开头，完整响应为HTTP524、标题`dragon3api.com | 524: A timeout occurred`，经过125804毫秒返回；Ray ID `a4a974f3db640983-AMS`。原截图本身没有状态头，不能断言原请求也一定为524，但此次复现已确认这种现象的具体来源。
- 顶部 `接口已移除，请重新选择`：指批量生图窗口记住的配置ID已不在当前目录中。批量入口与每张资产卡的模型选择独立；此项需要重新选择，但不会使已经单独选择龙/志/W的资产请求统一失败。保留失效选择、要求显式重选，避免悄悄换模型产生费用。

## 客户端复核

自定义图片请求由本机直接POST到配置的第三方 `/images/generations`；含参考图时使用 multipart `/images/edits`。生成成功后才保存本地并附加到腾讯云协作资产。当前错误发生在获取图片结果之前，没有证据指向腾讯云协作存储/权限导致本次三站生成失败。

该通用请求实现自2.8.17后没有相关功能变更。没有发现会统一导致三家失败的客户端故障；但客户端会将HTML网关错误直接显示为解析异常，且这条同步请求在收到524时没有任务ID可以恢复。属于错误诊断及长任务追踪的不足，不能用修改文案替代上游通道修复。

执行现有模拟回归：

```text
node --test electron/image-reference-api.test.cjs electron/media-reference.test.cjs core/modelCapabilities.test.js core/canvasStore.test.js
7 tests passed, 0 failed
```

覆盖无参考JSON生图、单图/多图multipart参考、地址归一化、失败时不偷偷退回无参考重付费等。模拟回归不作为上游真实出图成功的证据。

## 用户授权后的真实测试

测试时间约04:50–04:54（请求时间与部分服务商机器时钟存在差异，以本机记录和请求ID关联）。提示词为无人物、无文字的白瓷茶杯静物，不包含用户剧本。首次使用未修改的2.8.36 `generateImage`；后续使用独立Node fetch直连进行对照，绕过行舟业务代码。

| 站点 | 测试 | 实际结果 |
| --- | --- | --- |
| 龙 | gpt-image-2，1280x720，n=1，url返回 | 约126秒HTTP524 HTML；后台后续成功计费，见下段 |
| 志 | 同一标准横图请求 | 约8秒477，上游图片任务失败或需要审核 |
| 志 | 只将size改为1024x1024 | 约6秒477 |
| 志 | 去除size/response_format的最简请求 | 400 unsupported_parameter，参数检查阶段拒绝 |
| 志 | 只将型号改为gpt-image-2.5-flare | 约7秒477 |
| W | 同一标准横图请求 | 约4秒400 request_failed |
| W | 最简请求，不带size/response_format | 约3秒400，同一通用文案 |
| W | 只将size改为1024x1024 | 约3秒400，同一通用文案 |
| W | 参照网站UI使用size=1K、resolution=1K、aspect_ratio=16:9 | 约3秒400，同一通用文案；此对照不等于外部API规范已获确认 |
| W | 只将型号改为gpt-image-2.5-flare | 约3秒400，同一通用文案 |

龙的本次真实请求ID为 `202610142050317148710378268d9d6j9cp0tRe`。约82秒时先记录上游502；约126秒前端收到Cloudflare524；后台约162秒时又记录同一请求成功，quota=20000、model_price=0.04，即本次实际记录消费0.04美元。**因此“前端失败”不代表后台未生成、未扣费，不能立即重复付费。** 客户端未收到任务ID或图片URL，成功日志本身也没有结果URL；本次尚未取得图片文件。

为找回该笔结果，只读尝试了龙网站实际使用的`GET /api/image_studio/jobs`，API Key被网站登录鉴权拒绝（401 invalid access token）。未绕过鉴权、未把request_id冒充task_id、未重新付费生成。结果仍需网站登录后查看或由龙服务商按上述请求ID找回。访问检查证据`output/image-api-live-dragon-recovery-access-20261015.json`。

志本轮4条对应日志quota均为0。W测试后 `/v1/usage` 仍为有效Key、余额为正、总请求/总消费统计0。上述是可见服务商记录，不扩展为对隐藏内部账单的保证。

第二阶段证据：`output/image-api-live-test-20261015.json`、`output/image-api-live-minimal-20261015.json`、`output/image-api-live-square-20261015.json`、`output/image-api-live-waw-native-fields-20261015.json`、`output/image-api-live-flare-20261015.json`、`output/image-api-live-final-provider-records-20261015.json`。

技术参考：[Cloudflare 524说明](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/)说明源站未在代理读超时内响应，默认125秒，与本次测得约126秒一致。[龙官方图片文档](https://docs.dragon3api.com/model/image-gpt-image-2-generation)另有异步任务协议，[任务文档](https://docs.dragon3api.com/tasks)支持按已返回的task_id查询；本次走同步images/generations，没有收到可查询的task_id，不能把request_id冒充task_id。

## 建议处理

1. 龙服务商检查上述请求中的上游凭据禁用、可用账号和货源冷却，并处理同步请求超出Cloudflare约125秒上限的问题。本次先按`202610142050317148710378268d9d6j9cp0tRe`找回已计费结果；已经拿到524时不要直接重付费。仅调长客户端超时不能延长服务商边缘代理时限。后续可评估其公开异步task_id协议，但未在本次额外提交任务验证。
2. 志服务商按截图原请求ID检查477内部原因，解释通道失败/审核状态。现有用户可读日志不提供更底层原因。
3. W服务商核对原失败请求日志，提供明确状态、内部错误及支持的参数；不要仅以通用文案要求反复换提示词。
4. 当前避免对全部资产反复批量重试；先等待通道恢复，再做单张验证。更换站点不保证独立货源，本次没有证据证明三站共用同一供货商。批量选择失效另需显式重选；本次未替用户改选模型。

脱敏取证文件位于 `output/image-api-audit-20261015.json`、`output/image-audit-zhiqiapi.com-logs.json`、`output/image-audit-newapi.dragon3api.com-logs.json`。未联系服务商或向外发送项目/凭据。
