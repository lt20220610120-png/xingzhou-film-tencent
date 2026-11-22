# 2.8.154 验收记录

## 需求与修复

- API接口页删除首个接口空状态的冗余说明。
- 项目协作页空状态跨网格全列居中，样式只作用于项目入口，不扩大美术/聊天等其他空状态；同步按钮进入标题栏右侧正常flex流，避免绝对定位覆盖。
- 注册前后端共用 `cloud-backend/shared/registration-validation.mjs`，普通注册与卡密激活注册返回相同具体规则；账号3–32位英文字母、数字或下划线（不区分大小写），密码至少6位，邮箱有效。前端提交时定位并聚焦错误字段，保留输入，格式错误不发注册IPC。不把新注册规则强加于历史登录/找回路径。
- 导演自动生成：可选AI规划接口失败/空正文不阻断真实Skill，采用既有本地短剧估时、节奏和上限继续分段；核对接口故障标warning而不丢弃已保存结果。实际Skill失败不伪造提示词，不自动重复不确定的付费请求。
- 继续任务传递当前所选模型；模型A→B→C的合法连续转换链可提交，原计划、卡片ID、建议时长及已付费结果不变，断链拒绝。
- 执行层STOPPED/权限撤销/账号变化/429准入错误不作可用性降级，停止后不继续付费。

## 根因证据

截图真实错误是 `all accounts are temporarily unavailable, please retry later`，不是此前误读的Skill升级。只读检查点统计证实规划阶段、Skill阶段和核对阶段均存在同类失败，真实项目未写入。本次修复的是可选步骤错误阻断生成、核对失败误标整场失败与换模型续跑兼容性；不声称本地代码可修复上游账号池本身不可用。

## 自动化验证

- 最终全量 `npm test`：**3062/3062，fail 0**，日志 `output/154-tests-final.log`。
- 导演新回归先红后绿：`core/directorAutoPipeline.test.js`、`core/directorModelTransitions.test.js`，包含三档节奏、0/10/30/35秒选择、规划/审核/Skill不同失败策略、控制错误透传、连续模型转换。
- 真实Electron完整React链路（模拟API、无真实付费）：`scripts/verify-director-auto154-ui.cjs` 与 `scripts/fixtures/director-auto154.*`。报告 `output/154-director-ui-report.json`：右侧2张提示词卡、建议14/15秒；分段auto、最高15秒、pace50保持；本地持久化2张；失败重生成不清旧卡；切模型继续命中新profile。
- 注册/协作/API真实React+Edge三宽1320×880、1000×660、1700×1000通过，`scripts/verify-registration-collab154-ui.cjs`。错误自动聚焦、无效不发IPC、重试输入保留、普通/激活注册、验证码、登录/找回兼容、协作空/制片/有项目和API空态均通过。
- `npm run build`通过，现有大chunk提醒不作为失败。
- 最终打包 `packagedRuntime:PASS`，`errors:[]`，报告 `qa/packaged-smoke-2.8.154-1794476507121/report.json`。
- ASAR导演核心文件与工作区逐字节一致；前端bundle包含统一注册提示。测试专用共享验证mjs前端已编译入bundle，不要求作为独立源文件进入ASAR。
- 先前失败是音频250ms采样时currentTime=0；原包和最终重打包原验收均通过，未跳过/放宽测试。WorkBuddy未登录拒绝属于预期，不是失败原因。

## 安装包

- 文件：`release/2.8.154/Xingzhou-Film-Tencent-Setup-2.8.154.exe`
- 大小：104040420字节
- SHA256：`0c3fa3e1a9c25d942dbb3aec56ec8863d4131e2698a889c2de1a271a36724b0c`
- GitHub Release ID：442745126

## 注册服务端部署

- 仅三文件部署：`src/auth.cjs`、`src/software-license-repository.cjs`、`shared/registration-validation.mjs`。部署前与Git基线核对仅换行差异，原件备份 `/opt/xingzhou-backups/registration-2.8.154-20261112T094400Z`。
- 隔离stage与指向live的纯mock测试各 **26/26**，读回逐字节一致，52个其他运行时代码文件未变，无schema变更。
- 父代理独立SSH核对live SHA256：auth `17ce62c3962485091449902bbee42f3f471aff10ea0ccca7785bfc7ce3309c10`；license repository `a3f14a21d665ce4506642a5333483a9c7993c2a441ed2755e05bc989049b0ab9`；shared validation `8f02b68f8a695d6a56f80fdcc95b987fcdab092a644ffdded5b4dbf37d39bdca`。服务active，healthz返回ok=true，备份存在。
- 证据 `output/registration-deploy-2.8.154-20261112T094154Z/verification.json`。

## 发布状态

**已公开发布并完成核验。** 官网与两个GitHub main三份清单逐份Ed25519验签且内容完全一致；官网整包大小/SHA256通过；Range重试206、首65536字节与本地一致；GitHub资产uploaded且size/digest一致；正式更新通道读取2.8.154并确认2.8.153可升级。证据 `output/review-154/public-verification.json`、`in-app-update.json`。首次公开核验完成整包哈希后Range遇TLS错误，保留原失败日志并单独重试Range通过，不将失败项计为成功。

官网：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.154.exe

GitHub：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.154/Xingzhou-Film-Tencent-Setup-2.8.154.exe

## 安全边界

未改写真实项目/素材/检查点，所有生成验证模拟，无真实付费生成；不修改代理/TUN/网关配置，不强关或覆盖用户运行客户端。
