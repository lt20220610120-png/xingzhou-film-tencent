# 视频模型自主接入（2.8.26）

目标：型号、能力、协议作为可编辑的本地配置。上游发布新型号后，用户刷新目录或填写新编号即可使用，不再等软件更新内置型号。不会以付费生成请求试探协议。

## 常用操作

1. 在「API 接口 → 视频 API → 编辑/添加」填写生成接口地址与 API Key。
2. 点击「拉取／刷新视频型号与参数」，选择型号；也可以在「拉取/导入模型」中批量选择并确认视频用途。没有列表接口的服务，可直接填写 model ID。
3. 选择上游文档对应的视频协议。飞拓主站自动识别；其他服务请选择方舟、Videos JSON、Videos 表单或自定义。模型目录不一定声明调用协议，软件不会根据名字盲目提交多种付费请求。
4. 保存后，在「图视生成」选择这个配置及型号。时长、分辨率、比例和参考数量跟随目录；未声明的时长与分辨率可在生成界面手填，也可以在 API 编辑中补充限制。切换型号会重新选择参数。

修改参数后使用的是修改后的能力，不是旧目录里的白名单。目录、协议和参数均保存到本机项目状态；读取模型目录不创建协作云端项目。

## 协议与参数

| 选项 | 适用形态 | 注意事项 |
|---|---|---|
| 飞拓标准 | `video/generate`、`video/status?jobId=...` | 主站保留本地文件、多素材和旧配置；同类代理站可显式选择此协议 |
| MaxForAI | `POST /v1/videos`、`GET /v1/videos/{id}` | 2.8.32 起一键接入；可拉取未来新型号。本地参考先上传 `/v1/assets`，生成请求带幂等编号，结果从同任务内容接口下载 |
| 9Y 视频 | `POST /v1/videos`、`GET /v1/videos/{id}` | 2.8.32 起一键接入；字段自动换成 `seconds`、`aspect_ratio`、`reference_*`。素材须为公网 HTTPS，Wan 视频参考需填写单段时长 |
| 火山方舟 | `contents/generations/tasks`，查询同一 ID | 支持 content 中的图片、视频、音频；本地参考转换为数据地址，上游不允许时使用公网地址或自定义模板 |
| Videos JSON | `videos`，JSON 提交与 ID 查询 | 预设支持一张 input_reference 首帧；多素材请求需按上游字段改为自定义模板 |
| Videos 表单 | `videos`，multipart 提交 | model/prompt/seconds/size，与 input_reference 文件；适合要求文件表单的兼容接口 |
| 自定义 HTTP | 用户填写路径、请求字段、响应路径 | JSON 或 multipart；GET/POST/PUT；支持 Bearer、自定义头、query、body 和无鉴权 |

接口结构参考：[方舟视频文档](https://docs.volcengine.com/docs/ark/video-generation-tutorial?lang=en)、[Videos 异步接口文档](https://developers.openai.com/api/docs/guides/video-generation)。实际账号权限、型号规格、限制及费用以所用服务商为准，不能仅凭模型名称推断协议。

## 不同字段命名的上游

选择「自定义 HTTP 字段映射」，在 JSON 中修改。例如：

```json
{
  "submitPath": "render",
  "submitMethod": "POST",
  "queryPath": "check/{{taskId}}",
  "queryMethod": "GET",
  "authMode": "header",
  "authHeader": "x-api-key",
  "authPrefix": "",
  "bodyType": "json",
  "referenceMode": "urls",
  "requestTemplate": {
    "engine": "{{model}}",
    "description": "{{prompt}}",
    "seconds": "{{duration}}",
    "images": "{{imageUrls}}"
  },
  "response": {
    "taskId": "ticket.key",
    "status": "phase",
    "url": "artifact.video"
  },
  "successStatuses": ["READY"],
  "failedStatuses": ["BAD"],
  "pollSeconds": 30
}
```

- `submitPath`、`queryPath` 相对生成地址；以 `/` 开头则相对服务商域名根路径。也可填同一服务商的完整地址。查询 ID 使用 `{{taskId}}`，会做 URL 编码。
- JSON 请求变量有 `model`、`prompt`、`duration`（数字秒）、`seconds`（文字秒）、`ratio`、`resolution`、`size`、`firstImage`、`imageUrls`、`videoUrls`、`audioUrls`、`content`。整个值为变量时保留数组/对象/数字类型。没有执行脚本的能力。
- 响应路径使用点号：如 `data.id`、`data.0.url`。多种返回字段可以用 `|` 分隔。GET 查询如需参数可配置 `queryTemplate`；POST/PUT 查询则按该模板发送 JSON。
- 文件表单需要 `bodyType: "multipart"`、`referenceMode: "multipart"` 与 `fileFields`，例如 `{ "image": "images", "video": "videos", "audio": "audios" }`。本地与远程参考按原顺序转为文件提交。
- query/body 鉴权使用 `authMode: "query"` 或 `"body"`，并填 `authField`（如 `key` 或 `api_key`）。密钥由上方 API Key 动态注入，不把真实密钥写进协议 JSON。body 鉴权需要 POST/PUT 请求体。
- 如模型列表地址不是常规 `/models`，可填写独立的「模型列表路径」。它不会改变生成地址。列表解析支持常规数组、data 或 models；其他格式可以手动填写型号和参数。

## 任务与兼容性

提交成功会立即保存任务编号、参数及协议。重启后继续查询；下载失败重试查询/下载，不再生成。直返视频地址、没有任务 ID 的结果也能重试原地址下载，但上游若使该地址过期且无查询接口，需联系上游找回结果。

更换配置的服务商地址后，旧任务暂停查询，防止把新服务商密钥发送给旧站点。请保留或恢复原服务商配置；更换型号不抹掉历史。复用历史结果只复制创作参数，不继承旧付费任务号。

本版处理 HTTP JSON/multipart 接口，响应需要 JSON 任务编号或视频地址，或查询成功后的鉴权视频下载入口。只有专用 SDK、动态签名、浏览器登录、仅 Webhook 或直接返回视频二进制的提交服务，不能承诺仅凭地址密钥自动兼容。遇到此类服务需要额外适配。读到型号并不等于该账号有生成权限或余额。

验收采用模拟接口，不提交付费生成。覆盖未内置 ft 型号、其他上游、手动覆盖参数、首帧文件、自定义返回字段、重启查询、失败下载恢复、跨站密钥保护及旧任务兼容。

## MaxForAI 与 9Y 快捷接入（2.8.32）

在“API 接口 → 视频 API → 添加接口”或图视生成的“API 设置”中，点击“接入 MaxForAI 视频”或“接入 9Y 视频”。软件会填入官方基础地址和协议；用户只需填写自己账号生成的 API Key，再点击“拉取／刷新视频型号与参数”。保存后，同一个视频配置会同时出现在图视生成和项目协作分镜中。

- 两家均从各自 `/v1/models` 只读拉取目录。以后上游新增型号时可直接刷新，不需要等待行舟影视内置新编号；用户仍可手填大小写完全一致的 model ID。
- 混合目录优先使用上游声明的输出模态及明确视频型号特征。未声明用途且无法分类的型号可在“拉取/导入模型”中人工确认视频用途，或直接手填编号与参数；不会把文本/图片型号直接当作视频提交。
- 拉取型号只读取目录，不会创建付费任务。真正提交只发送一次；网络结果不明时保留为待核对任务，不切换入口重复付费。
- MaxForAI 按其官方统一视频入口发送 `duration / ratio / resolution / images / videos / audios`。行舟影视的 `@图片1 / @视频1 / @音频1` 会在提交时转换为官方引用编号；本地素材上传到同一 MaxForAI 账号。
- 9Y 按其视频入口发送 `seconds / aspect_ratio / reference_images / reference_videos / reference_audios`。9Y 没有供该协议使用的本地素材上传入口，因此本地文件不会被静默忽略，提交前会明确提示改用公网 HTTPS 地址。
- Wan 的视频参考卡可填写素材时长；单段 1–15 秒、合计不超过 15 秒。素材时长跟随当前提示词草稿保存，切换非 Wan 型号只发送该型号要求的 URL 字符串。

官方文档：[MaxForAI](https://maxforai.top/docs)、[9Y 视频](https://9yapi.shop/docs/#videos)。型号价格、账号分组、审核和素材限制以服务商当时文档及任务记录为准。
