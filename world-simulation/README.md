# 行舟大世界模拟内核 V1

与 React / Electron 无关的原创 JavaScript 模块。行舟 2.8.11 的两个创作入口使用同一个内核，没有另外启动 Python 服务或复制一份引擎。

## 独立运行

Node >=22.13，无第三方运行依赖：

```powershell
npm test
npm run demo
node cli.mjs demo ./new-world.sqlite
```

SQLite 示例使用新的数据库文件；内置示例是虚构验收内容，不是用户已确认的小说设定。`WorldStore.save(world, expectedRevision)`提供事务和版本冲突保护。`load(id)`恢复完整世界与记录。

## 使用接口

`createWorld(seed)`创建作者确认的起点；`proposeNext(world, branchId, {request, ...options})`由接入方提供模型调用。`addCandidate`只保留候选，`commitCandidate`原子采用；`forkAt`修改历史并保留旧路线，受影响后续放入pending，无关未来放入scheduled，时间到才发生。`compareBranches`对照变化，`exportLife`输出主角已采用人生事件。

seed.characters 的人物ID、姓名、资源、关系、地点、knowledge需明确；facts包含knownBy/public；rules可标public:false；routes声明from/to/minutes。事件含time、actorIds、dependsOn、reads、requiresKnowledge、effects、observations、learns。effects字段白名单为alive/locationId/goal/resources.KEY/relations.ID。旅行按人物自己的活动时间，未知ID、负资源、死亡人物行动、原型字段和过期候选被拒绝。

模型先为少数活动人物生成行动提议，再由全局世界裁决生成路线。作者计划authorPlan仅进入世界裁决，不进入人物观察，也不自动成为历史。资料均作为数据处理；硬校验只覆盖显式声明的约束，不能代替完整语义审稿。

## 与行舟的契合

`core/worldSimulationAdapter.js`读取新作已确认身份和规则；素材角色、未采用意见与未来大纲不充当正史。原模拟入口、原版本库仍可用。新模拟通过作者明确写回到原有大事件/大纲流程，旧正文保留、下游引用按原流程提示复核。项目依据改变时拦截过期写回。导演、IP和成品库不新增本入口。

行舟使用已有的受保护项目文件保存世界；SQLite仅用于独立模块，避免JSON/SQLite双写。包内同一个引擎和本地保存由真实安装包运行验证。

## 首版边界

时间单位是世界分钟，相对故事起点；规则文本是AI约束，结构化状态是内核硬校验。修改过去按因果/字段/参与人物保守失效，不声称识别所有隐含因果。每轮至多8名活动人物、5条路线、100次调用；自动推进至多10轮。默认不自动收费续跑，中断后任务记为interrupted。

最多12M字符原文可分块，精确offset和有限检索窗口；这是文本保存/检索能力，不是已经证明的百万字世界建模质量。checkpoint保存可用于审计，当前回放仍遍历历史。尚不支持大规模后台社会仿真、外部数据库搜索、多机同步或无限回放性能；语义抽取、剧情质量和模型成本需真实小说评测后继续优化。

研究与协议见 [RESEARCH.md](RESEARCH.md)。未复制第三方代码。
