# 编辑器布局与分镜缓存 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in this session. Steps use checkbox tracking.

**Goal:** 精简分镜/生成界面并提供不挤占空间的素材提示、紧凑素材与匹配高亮、建议时长，以及切回分镜即时显示。
**Architecture:** 沿用React组件、原生textarea及绑定数据。提示浮层Portal共享组件支持悬停/键盘；高亮采用原生textarea的同步视觉层，仅对真实编号素材着色，不改正文存储/提交。绑定读取结果按API/账号/项目/版本/资料目录缓存并合并请求，输入变化/保存事件后台更新，提交仍重新验证。
**Tech Stack:** Electron、React、CSS、Node测试、Playwright。
**Spec:** 用户本轮8截图及后补分镜切页缓存指令；先前长期前端和自动发布偏好继续有效。

## Global Constraints
- 直接实现、测试、独立复核、发布2.8.138；不另请设计确认（用户明确长期授权）。复用当前干净发布分支，不新建工作树。
- 不写真实工程、不真实付费，不关闭正在运行客户端；可访问名称/导航/后果提示保留。
- 仅实际匹配别名高亮，编号随现有逻辑；native输入保留IME/选择/撤销/复制，正文与token字符串不变。

## Review Focus
- 悬停可移动进浮层，键盘可打开/Esc关闭，离视口边界正确定位且无内容重排。
- 高亮层在换行/滚动/放大/中文输入时与textarea对齐，虚假别名不标已匹配。
- 切账号/项目/版本/新采用图不会读错缓存，拒绝权限时不得继续显示旧数据。
- 手工编辑与删除恢复、默认设置不因布局或后台读取重挂载而丢失。
- 无时长元数据不臆测，有建议34秒等旧数据也可展示但不改真实生成时长。

### Task 1: 共享提示与素材高亮
- [x] 新增core/promptDisplay.js及测试，验证文本分段逐字复原、有效别名及时间元数据。
- [x] 先运行观察失败，再实现最小函数。
- [x] 新增HoverInfo/高亮层，GenerationComposer顶栏提示/时间；统一素材尺寸、alias悬停名称；保持原生输入与字符数。
- [x] 分镜移提示到保存区左侧，删草稿文案、删场景分镜标题、侧栏数量、删默认标题；导演序号完成边框无点。
### Task 2: 缓存与切页
- [x] 新增core/projectBindingCache.js及延迟请求/输入变化/失效/错误隔离测试（先失败）。
- [x] useProjectPromptBinding立即使用同scope缓存，合并请求和后台刷新，不隐藏已有卡片；保存事件全scope失效。
### Task 3: 验收与发布
- [x] 三宽真实UI悬停不重排/键盘/统一素材/有效token/建议34秒/侧栏计数/完成边框/切页0额外绑定请求。
- [x] 原有版本命名补漏、音色/采用图/手工草稿默认及恢复链路回归；独立复核整批。
- [ ] 全量、构建、NSIS实际运行→提交推送→官网/GitHub及更新清单验证→更新交接与工作区记忆。

Ruling: 用户要求高亮可用颜色或chip；使用色彩高亮保持原生textarea编辑能力，避免改成contenteditable引入IME/粘贴/撤销风险。
