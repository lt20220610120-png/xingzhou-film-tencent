# Hermes 协作进度档案

Codex 默认直接在 `D:/AI/Qwen3-TTS/xingzhou-release` 开发。Hermes 只在用户明确要求后接手。开始时阅读[开发交接手册](开发交接手册.md)，核对实际 Git、测试与公开渠道。完成重要阶段后在本页写当前进展和未核实事项。

## 当前进展

2.8.210 已发布。本机项目首次邀请验证了真实网关鉴权、素材上传、旧检查点恢复和提交前改邀。云端完整备份后上线，健康检查正常。官网、GitHub 与 2.8.209 软件内更新均已核验，本机与官网镜像保留 2.8.206–2.8.210。

## 前端视觉约定

正文与标签使用 `brand-theme.css` 的四级墨色 Token，白底或浅底对比度至少 4.5:1。顶部操作可折行，人物与场景快速跳转芯片条可带箭头横滑。标准控件为 36px 高、8px 圆角。分段 Tab 使用 `#eceef5` 轨道和白底 `--ui-accent-text` 激活块，操作区只设一个 `#6c56bd` 实心主按钮。卡片避免灰框套灰框，次要规则收进可键盘访问的 `HoverInfo`。继续禁用 `frontend-design` Skill。详见[仓库约定](../AGENTS.md#前端视觉长期约定2026-11-25)。

## 最近已发布版本

- **2.8.210，2026-11-26。** 修复带本机素材的项目首次邀请误报无权限。待同步项目仅允许所有者按本次请求申请上传签名，最终提交后对协作者可见。旧检查点可续传，提交前可改邀。源码 `49b3777`，Release 458405881。[验收](release-verification-2.8.210.md)
- **2.8.209，2026-11-26。** 导演后补估同步到同源分镜，素材调整保留估时。推荐设置和批量队列跳过异常项，素材叹号可定位清单。三档 Electron、隔离 PostgreSQL 与 2.8.208 → 2.8.209 通过。源码 `ed9c80f`，Release 458368622。[验收](archive/verification/release-verification-2.8.209.md)
- **2.8.208，2026-11-25。** 合并商业 UI 改版，拉齐文字对比度、资产与音色工具栏、分镜设置及视频池响应式。三档 Electron 与 2.8.207 → 2.8.208 更新通过。源码 `c6c4b63`，Release 458320787。[验收](archive/verification/release-verification-2.8.208.md)
- **2.8.207，2026-11-25。** 修复共用弹窗居中、本机资产删图及错误反馈。三档 Electron 验证双模式删图、采用切换、取消和重开。云端业务服务继续使用现有版本。实现 `c636a97`，Release 458247809。[验收](archive/verification/release-verification-2.8.207.md)
- **2.8.206，2026-11-25。** 估时采用实拍校准版 3.0.0 算账，快速 Chat 模型估时关闭思考，常用数字和缩写有默认读法。云端兼容 2.0.0 与 3.0.0。实现 `f34f01e`，Release 458076807。[验收](archive/verification/release-verification-2.8.206.md)
- **2.8.205，2026-11-25。** 精准估时改用语义拆解和确定性计算，单条补试、明确错误和进度。导演超载需确认才重分，长下拉统一省略。实现 `b57484a`，Release 457859093。[验收](archive/verification/release-verification-2.8.205.md)
- **2.8.204，2026-11-24。** 分镜按时长模式校验提交，手调保护保秒数并同步通用参数。内置精准估时兼容围栏与字段顺序。实现 `8f79de7`，Release 456326203。[验收](archive/verification/release-verification-2.8.204.md)
- **2.8.203，2026-11-24。** 内置视频精准估时 Skill 2.0.0，导演分段与估时解耦，自动超载重分至多一次。分镜按 15/30 秒上限对齐模型合法档位，保护手调并支持改稿重估。已通过云端备份部署、正式载荷与 202 → 203 软件内更新。实现 `2ba0d2a`，Release 456295383。[验收](archive/verification/release-verification-2.8.203.md)
- **2.8.202，2026-11-23。** 分镜有效参考图连续编号，保留原资产座位与正文锚点。美术与资产可标记无需参考图，采用后解除，付费生图前核对最新状态。LibTV 准备跨短抖动。实现 `41fb46f`，Release 455295736。[验收](archive/verification/release-verification-2.8.202.md)
- **2.8.201，2026-11-23。** LibTV 真直连及三类诊断，后台读取复用，两路素材准备与实时进度。隔离 Electron、正式 NSIS 与 200 → 201 更新验证通过。实现 `a70c61c`，Release 455216856。[验收](archive/verification/release-verification-2.8.201.md)
- **2.8.200，2026-11-23。** LibTV 本机网络模式、SOCKS5、连接诊断和准备阶段反馈通过隔离验证。正式 NSIS、三份签名清单与 199 → 200 更新下载通过。实现 `71322bc`，Release 455106129。[验收](archive/verification/release-verification-2.8.200.md)
- **2.8.199，2026-11-23。** LibTV 多素材恢复上传和可读诊断，分镜增删保位、切场回顶、视频池一次性定位。真实 Electron、正式 NSIS、三份签名清单及 198 → 199 更新下载均通过。实现 `5885ede`，Release 454973543。[验收](archive/verification/release-verification-2.8.199.md)
- **2.8.198，2026-11-23。** 修复 Windows 历史目录加密凭据兼容，新增激活页已有账号登录。真实 Electron 复现断档并验证原设备身份，正式 NSIS、三份签名清单和 197 → 198 更新下载通过。实现 `e24ae72`，Release 454679579。[验收](archive/verification/release-verification-2.8.198.md)
- **2.8.197，2026-11-23。** 退役豆包入口、旧页面、废弃部署和单次验证，旧项目可读。分集与采用图规则共用。历史按版本归档。完整备份后部署后端，正式 NSIS、三清单和 196 → 197 更新通过。实现 `023544d`，Release 454658607。[验收](archive/verification/release-verification-2.8.197.md)
- **2.8.196，2026-11-23。** 统一控件、下拉与确认弹窗，后台轮询按可见性暂停，隔离编辑和制作进度更新，首段审计去重。验证 Windows 正式载荷及 195 → 196 更新。实现 `e900e68`，Release 454639873。[验收](archive/verification/release-verification-2.8.196.md)
- **2.8.195，2026-11-23。** 导演使用最新可用规则并保留既有绑定，修复音色、提交、素材及持久化，完善云媒体授权和索引。验证隔离 PostgreSQL、Electron 与 194 → 195 更新。实现 `fa91446`，Release 454605147。[验收](archive/verification/release-verification-2.8.195.md)
- **2.8.194，2026-11-23。** 项目图音缓存、COS 内网小件中转、轻量外发参考及五版留存。验证云端健康、隔离 COS 内网读取和 193 → 194 更新。实现 `31149c7`，Release 454579102。[验收](archive/verification/release-verification-2.8.194.md)

逐版本记录与历史交接原件见[历史发布档案](archive/README.md)。
