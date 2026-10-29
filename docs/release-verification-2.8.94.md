# 2.8.94 发布验收记录

日期：2026-10-29

## 实施与接续规则

- `productionMonitor` 以当前集的 sourceReviewScenes 对账，批量读取清单、发布签名、提示词决策、图片；不逐场调用模型。缺场景容器只从原文补容器，保留旧清单、图片与已发布凭据。
- 已发布且已有真实素材关联的场景直接复用，第一版不要求每条达到完美准确率。有效人工“无需参考图”须有当前签名、已确认和合法排除原因，也视为已处理。无效 cardUid 不能冒充关联。正文变化保留原成果，记录待核对，不隐式重做。
- `productionAdapters.art` 仅将缺项集/场送入原 pipeline；只审核/发布待完成场景，按集分组并发4。提示词、图片复用原实现；视频列表每轮集中读取一次，已有任务恢复轮询/归档。开始/刷新/改选项目互斥。
- 暂停不清检查点，重开恢复为暂停待继续。原片流式 SHA256 验收，进程内按路径、大小、mtime/ctime和预期hash缓存；变化重新验收。超分按唯一片段ID、原片hash、倍率和每个输出hash检查；成片按验收凭据检查文件。缺失重开接续，目录/验收不可用不会误报全部完成。
- 后期仍保留依赖：本集原片齐才进入Topaz，全局单队列；本集超分齐才剪辑，剪辑单队列；不同集与视频生成可交叠。按身份与凭据判断，不用目录内文件数冒充完成。

## Agent 接入依据及实测

- 官方接口文档：[Codex app-server](https://developers.openai.com/codex/app-server)、[openai/codex README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)。本机生成JSON schema核对字段，无第三方登录插件依赖。
- 官方 `account/read`、`account/rateLimits/read`、`skills/list`、`mcpServerStatus/list`。MCP 使用 `detail:toolsAndAuthOnly` 避免为展示状态加载全部资源；服务未提供运行状态时显示未知，不假报已连接。
- 真实本机只读连接成功：ChatGPT Plus账号、8个模型、300分钟及10080分钟额度窗口、29个Skill、7个MCP服务。未在记录中保存邮箱或凭据。额度按实际windowDurationMins显示，缺失窗口不推算；Skill数量为连接工作目录发现，不代表每条任务都实际调用。
- IPC仅返回账号展示字段、额度、Skill元数据、服务名与工具数量，不返回认证令牌、MCP地址/headers或Skill正文。管理员IPC授权保留。

## 验证

- `npm test`：2517/2517通过；`npm run build`通过（仅既有大包体提示）。独立复核47/47定向测试通过，合法无参考选择、刷新失败恢复和超分清单验收增量已闭合。
- UI覆盖1280/1700/2232宽度，模拟账号与5小时/周额度、只读刷新、逐场完成证据、滚动对话、启动暂停、文件选择弹窗、视频池范围下载。
- 回归覆盖：已发布复用、部分关联、缺场景、无效引用、合法无参考/过期排除、暂停/重启接续、不重复视频提交、只读刷新不建协作、不重复同步、刷新互斥、文件丢失、hash变化、目录越界、超分缺片/倍率变更。
- 三宽交互脚本通过，报告 `output/playwright/furnace-2894-ui.json`。实际安装包运行时PASS：`qa/packaged-smoke-2.8.94-1793273346130`，包含管理员门禁、隔离、安全沙盒、视频预览、数据恢复及页面启动。

## 安装包

- 源码提交：`df992cf`。
- 本机：`release/2.8.94/Xingzhou-Film-Tencent-Setup-2.8.94.exe`。
- 大小：103894638 字节；SHA256：`1937986ccb8ced0af8115a8bfab14b1ecc23b324ee4d1c67735b07656289ac6a`。
- 未安装覆盖当前正在使用的软件，提供正式安装包升级。

## 发布核验

- 官方安装包：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.94.exe
- GitHub：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.94/Xingzhou-Film-Tencent-Setup-2.8.94.exe
- 官方服务器安装前完整SHA256和大小核验通过。官方与两个GitHub main/latest.json均为2.8.94，Ed25519签名及version/size/sha256/installerUrl与本机清单一致；公开下载Range206、总大小和MZ头通过，报告 `output/release-2.8.94-public.json`。

## 能力边界

生成验证使用模拟接口，真实Codex接入仅做只读状态读取。未运行真实整剧付费生成、Topaz及OpenFilm联合成片，不宣称已验收画面和叙事质量。监测不把结构性完成等同于关联百分百准确。自动化仍在管理员后台试用；本次不向普通用户开放自动化。
