# 2.8.32 发布验收：MaxForAI 与 9Y 视频接入

日期：2026-10-12

## 范围

- API 接口和图视生成 API 设置新增 MaxForAI、9Y 视频快捷入口。
- 两家 `/v1/models` 只读目录映射到本地视频配置；未来新型号可刷新或手填。
- 图视生成、项目协作分镜和画布沿用同一 `mediaProfiles`，无需新增云端字段或迁移用户项目。
- 生成、查询、下载、错误解析和素材规则按两家官方视频文档分别适配。

## 契约核对

- MaxForAI：`POST /v1/videos`，请求字段 `model/prompt/duration/ratio/resolution/images/videos/audios`；`GET /v1/videos/{task_id}` 查询；`GET /v1/videos/{task_id}/content` 下载；本地素材通过 `POST /v1/assets` 上传；生成请求使用稳定 `Idempotency-Key`。
- 9Y：`POST /v1/videos`，请求字段 `model/prompt/seconds/resolution/aspect_ratio/reference_images/reference_videos/reference_audios`；原任务查询和内容下载继续使用 `/v1/videos/{id}`。素材必须为公网 HTTPS；Wan 视频引用需单段 1–15 秒且合计不超过 15 秒。
- 两家密钥只在实际同源请求中注入，不写入任务历史、模型目录或协议模板；查询不会自动重新提交付费任务。
- 远程素材只接受公网 HTTPS，HTTP、本机、环回和私网字面地址在任何素材读取或生成前拒绝；Max 本地上传只使用用户素材选择器返回的文件路径。

## 自动化验证

- provider 专项：模拟 Max 本地素材上传、提示词引用编号转换、幂等提交、原任务查询和鉴权内容下载；模拟 9Y 多素材字段、Wan 时长、原任务查询；确认非法本地素材在零付费请求时失败。
- 目录专项：完整生成路径和官网文档路径都规范到 `/v1/models`；当前型号合并已知能力，未来视频型号无需版本白名单即可进入生成选择；明显文本型号不会混入视频目录。
- 正式 `npm run dist` 完成：全量测试 2048/2048，0 失败；独立复核修正后，provider、目录和逐条素材时长保存专项通过 29/29。
- `npm run build` 通过，Vite 转换 2051 个模块；只有既有的大 chunk 提示，没有构建错误。
- Electron 登录态真实界面已打开“API 接口 → 视频 API → 添加接口”，分别点击 MaxForAI 与 9Y 快捷入口，确认官方地址、协议和参数即时切换；未填写密钥、未发送生成请求。
- 隔离 React 界面验证两家快捷接入 → mock 拉取目录 → 保存本地配置 → 生成选择 → mock 提交；核对各自地址和协议，Wan 6.5 秒素材时长透传。记录在 `output/playwright/video2832-wan.png`。此 fixture 不接触真实用户状态或付费接口。
- 独立复核发现并修正素材远程读取、目录混入非视频、Wan 切换非 Wan 的引用格式问题；最后修正有专项回归。未进行云端业务部署或用户项目数据迁移。
- NSIS 安装包完成，打包运行验证通过（报告 `qa/packaged-smoke-2.8.32-1791801210827`，版本 2.8.32，errors 为空）；视频配置/未来目录模块、页面、桥接、LibTV、DOCX、媒体和安全约束均通过。
- 所有生成验证均为 mock，未使用用户 API Key、未调用真实付费任务。

官方依据：[MaxForAI 文档](https://maxforai.top/docs)、[9Y 视频文档](https://9yapi.shop/docs/#videos)。

## 正式发布

- 公开安装包：[2.8.32 安装包](https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.32/Xingzhou-Film-Tencent-Setup-2.8.32.exe)。
- 本地安装包：`release/2.8.32/Xingzhou-Film-Tencent-Setup-2.8.32.exe`；大小 103601227 字节；SHA256 `ad8f18c5e8c396ef37775d208a53c05ba5ad6dc877b17faeefe7a834b3ecad35`。
- 源码功能提交 `a32b932`，合并公开清单历史 `c77fd09` 并同步 GitHub main；发布清单提交 `a578c3d`。合并只取公开最新清单，未覆盖本地已验证的功能实现。
- GitHub 正式 Release 和两个仓库 main 的清单已发布；Contents API 与对应提交原始文件一致。公开安装包完整下载大小、SHA256 和 GitHub asset digest 均通过。证据 `output/release-2832-public.json`。
- 官方备用源上传后服务端完整大小/哈希通过；客户端签名、清单、65536 字节 Range 和整包总大小通过。客户端整包读取超出 120 秒，未宣称此轮客户端备用源完整下载通过；GitHub 公开整包已完整下载验证。证据 `output/release-2832-mirror.json`。

- 发布后独立核对通过；补充公开说明“未声明视频用途的新型号可确认用途后导入或手填”，文案提交 `f0ebed1`、重新签名清单 `bc69221`。安装包未变，修订后的双仓库清单及备用源签名/Range再次核对通过。
