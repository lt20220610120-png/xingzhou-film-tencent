# 行舟影视 2.8.153 验收记录

日期：2026-11-12
主题：注册界面无法滚动导致无法完成注册的根因修复；卡密记住后掩码显示一键激活；注册/激活页文案精简

## 用户反馈

1. 注册界面滑动不下去，底部「创建账号」始终点不到，用户无法完成注册。
2. 卡密在本机选择记住后，下次打开应以「·····」掩码填好，用户只需点击「验证并激活」。
3. 激活页「输入卡密，激活这台电脑上的软件。」这行字要删掉。
4. 前端原则：去掉不必要的标签、说明文字、辅助文案与冗余微文案，靠布局/层级/间距/唯一主操作自解释；保留必要表单标签与可访问名称；界面清爽不能牺牲可访问性。

## 真实根因

### 1. 注册界面无法滚动（阻断注册）

- `src/styles.css:69` 全局 `body{overflow:hidden}`（Electron 主界面是固定布局）。
- `src/account-access.css:3` 原本给 `.auth-screen` 设了 `height:100vh;overflow-y:auto`，但后加载的 `src/access-experience.css`（第 22 行）用 `height:auto;min-height:100vh` 覆盖，滚动容器退化成普通块级元素：页面按内容撑到 900px 以上，超出窗口的部分被 `body{overflow:hidden}` 直接裁掉，既不出现滚动条，也无法滚到「创建账号」。
- `electron/access-window.cjs` 进入账号阶段的默认窗口为 1500×940、最小 1120×720，表单在默认尺寸下已超出可视区，小窗口更糟。
- 结论：不是表单校验拦截，而是**内容被裁切 + 没有可滚动容器**，用户物理上点不到提交按钮。

### 2. 卡密每次都要重新输入

- `electron/software-license-client.cjs` 只在内存中保存 `activation` 令牌，卡密本身从未持久化；渲染层 `SoftwareLicense.jsx` 的输入框永远为空。

### 3. 引导文案过多

- `src/v06/AccountAccess.jsx` 渲染了 `行舟影视 · 创作空间`、整段说明、两张说明卡片（邀请码控制访问权限 / 一个邮箱绑定一个账号）、卡片内口号式标题与副标题、邀请码脚注，以及一个会直接关闭窗口的「返回上一步」。

## 修复内容

1. **滚动修复（`src/access-experience.css`）**：`.auth-screen` 改为 `height:100vh / 100dvh; overflow-y:auto; overscroll-behavior:contain`，注册页成为独立滚动容器，任何窗口高度下都能滚到底部；`.auth-layout` 改为 `margin:auto` 的居中列。
2. **窗口尺寸（`electron/access-window.cjs`）**：账号阶段默认 1320×880、最小 1000×660（原 1500×940 / 1120×720）。
3. **表单紧凑化（`AccountAccess.jsx` + CSS）**：注册字段改为两列网格（账号/姓名、密码/确认密码、邮箱/邀请码），验证码整行带「发送验证码」；卡片内边距、标签间距、输入高度、标签页间距收紧。实测 1320×880 下 **无滚动条且主按钮可见**（`scrollHeight 818 = clientHeight 818`，按钮 bottom 745 / 视口 818）。
4. **卡密记住（`software-license-client.cjs` / `main.cjs` / `preload.cjs` / `SoftwareLicense.jsx`）**：
   - 验证成功后用 `safeStorage`（Windows DPAPI）加密写入 `software-license-card.json`，**明文不落盘**；`safeStorage` 不可用时不写文件。
   - 新增 IPC `license-remembered-card` / `license-forget-card`。
   - 下次启动：输入框以 `type=password` 呈现记住的卡密（`·····`），只读，主按钮直接可点，按回车/点击即用记住的卡密验证，无需重新输入。
   - 输入框右侧提供 X（`aria-label="更换卡密"`），点击后清除记住的卡密、清空输入并聚焦，方便换卡续期。
   - 验证失败不会覆盖已记住的有效卡密。
5. **文案精简**：删除激活页说明行、注册页口号标题/副标题/整段说明/两张说明卡片/邀请码脚注，以及误导性的「返回上一步」（它实际会关闭窗口）。仅保留字段标签、发送验证码与唯一主操作；关闭入口仍是右上角 X。

## 测试与验证

- 全量测试 **3033 / 3033** 通过（`output/153-tests.log`）。
- 新增回归测试：
  - `electron/license-card-memory.test.cjs`：加密记住、失败不覆盖、加密不可用时不落盘（3 例）。
  - `electron/access-screens.test.cjs`：注册页无冗余文案且字段/主操作齐全；激活页无说明行且只有一个提交按钮（2 例）。
  - `electron/access-window.test.cjs`：更新为 1320×880 / 最小 1000×660。
- 真实 Electron 窗口实测（`output/153-ui-report.json`）：
  - 1320×880：可滚动、无溢出，主按钮可见，左栏说明块数量 0，字段 7 个。
  - 1000×660：`scrollHeight 790 > clientHeight 598`，滚到底后主按钮可见（bottom 537 / 视口 598）。
  - 激活页 520×450：无说明行、无多余 `<p>`，卡密框 `type=password` 且值为记住的卡密、只读、主按钮可点、存在更换按钮；点击 X 后变回明文空输入且主按钮禁用并自动聚焦；重新载入后零输入点击「验证并激活」，实际调用 `licensePrepare({code:'XZ-REMEMBER-8899'})`。
- 打包：`packagedRuntime: PASS`，`softwareLicense.gate=true`，`errors: []`。
- 发布核验：GitHub Release `v2.8.153`（ID `442522345`）资产 `uploaded` 且 digest 与本地一致；官网整包 SHA256 一致、Range 206 首 64 KiB 逐字节一致；官网与两个 GitHub 仓库三份 `latest.json` 完全一致并通过 Ed25519 验签；`2.8.152 -> 2.8.153` 软件内更新检测通过。

## 安装包

- 文件：`release/2.8.153/Xingzhou-Film-Tencent-Setup-2.8.153.exe`
- 大小：**104,024,774 字节**
- SHA256：`c4ced24a32481c0c960164e857c9989e54c18c45f8d57a0e650ad8c3b6621965`
