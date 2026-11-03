# 2.8.119 验收（2026-11-03）

基线6da0b54。用户要求聊天微调持续原制作链路、固定身份及开工流程认知，并压紧管理后台。

根因：chat无条件dispatchHold=true拦住新提交；原工具提示让范围改变依赖pause/run_stage，模型先停总控再反复查原任务。修复：聊天不持有派发锁，set_scope/clear_scope原位更新planRevision并默认resume，运行中run_stage不另起执行器。原状态机继续按配置处理缺片、主备失败接力、归档、逐片超分和整集剪辑，未知提交与下载故障不重投。

productionIdentity是随任务保存的超创身份；每轮chat、steer与后台work动态构建白名单任务契约，保留开工配置、当前范围、近20条安排及已验证经验。包括旧fallbackImageModel、主备次数/独立参数、音色补充分发等。任务契约不含API Key或scriptText，项目原文仍按需分页读取。

显式pause保持可用，以controlEpoch取消旧排队resume；scheduled令牌启动前移除，避免pause立即continue吞掉新请求。独立复核门闩与正式回归均确认count=2、peakConcurrent=1。复核遗漏的legacy生图备用已补齐并锁定测试。

UI采用现有浅紫白色与UI/UX Pro Max的状态反馈/紧凑导航原则；标题与四入口同排，删除说明、管理员制作中心及重复制作标题。工作台按实际getBoundingClientRect.top计算可用高度；两栏独立滚动，状态与输入框可见。

验证：
- 最终全量2704/2704，output/119-tests-final.log；构建output/119-build-final.log通过。
- 第一集缺片模拟：已有片不重生，主失败→备用成功→归档→逐片超分→整集剪辑，第二集已付费任务保留且不新增提交；实时收窄不取消已有提交。core/productionAdapters.test.js。
- 真实本机gpt-6.1-sol隔离内存工具探针：inspect→set_scope episodes=[1],until=edit,resume=true，未调用pause，143流式增量；自然语言说明后台持续主备生成、超分和剪辑。output/119-native-agent-probe.json（夹具数据）；没有付费生成API调用。
- 实际AdminPanel三宽1280/1700/2232：标题及四管理入口同水平、冗余标题不存在、状态和输入框首屏可见；模型/强度、Hermes模型、过程折叠、即时发送正常。output/119-ui-final.log与output/playwright/workspace-28119-ui.json；截图workspace-28119-paused-1700.png。

安装包运行与公开发布结果在完成后追加。未修改用户制作数据、未安装替换正在运行的客户端；此次真实模型验证只操作隔离内存工具，不代表真实付费生成、Topaz增强和OpenFilm成片的联合实跑。
