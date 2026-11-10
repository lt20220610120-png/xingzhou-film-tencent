# 2.8.143 验收记录

日期：2026-11-10。来源：用户要求移除分镜提示词冲突、协作者可直接改和生成、默认以清单已核实分发版本为准。

## 行为

- `episodes[].prompts` 保留导演来源与版本目录；`storyboardPrompts` 保存独立分镜工作副本。旧工程在同步时初始化副本，不重写已存分镜。
- 明确发布按场景写入选定版本原词、编译后的逐条图声引用和 publicationId。仅核实/自动关联/导演生成不发布。重复同一回执不覆盖后续手改；再次明确发布重置该场提示词/素材，保留集场结构、其他场景、模型设置及已有结果。
- 分镜保存 `editPolicy:direct` 采用最后成功保存，取消旧字段比较；前端无冲突面板/采用云端/生成确认。生成主进程检查真实云端项目成员、编辑角色、锁定、分镜身份与发布批次，不再逐字比对导演稿或其他人的新内容。旧客户端、导演三方合并与危险删除校验保持。
- 草稿按发布批次隔离。手改不被自动编译覆盖；原逐条参考可以按已选版本补齐新采用图片，人工移除和恢复素材保留。
- 美术/资产按已发布逐条映射展示使用范围。发布成功回执更新当前项目，不用等12秒轮询。

## 验证

- 全量2891/2891，13 suites，通过（node --test --test-concurrency=2，scripts/test.cjs同一套源测试）。`output/143-tests-final.log`。
- 真实 React + Edge，1280/1700/2232：连续保存、请求中继续输入、旧base与sourceConflict不拦生成、明确新发布替换默认、旧草稿不覆盖、重进保留手改、协作者读取对方修改并直接生成。3次模拟生成，0付费调用。脚本 `scripts/verify-storyboard-publication-ui.cjs`，证据 `output/playwright/storyboard-2.8.143/report.json`。
- 独立复核23/23、最终云端全套253/253与阶段12/12通过。修复工作副本创建/删除的重放及计数/删除标记隔离；启用新策略后导演源同步始终使用真实来源正文。
- 构建通过，NSIS与打包后真实运行smoke通过，qa/packaged-smoke-2.8.143-1794302656530/report.json。安装包104046886字节，SHA256 f2aec8e085afbe61776457d07c115703d99e262d41e4566b2574e68b73f4551e。复核后只有未打入客户端的云端源码/测试和部署脚本变化，沿用已验证客户端包。

## 云端

只部署 storyboard-merge.cjs、collab.cjs、repository-extras.cjs；无schema或用户工程批量改写。阶段12/12、健康检查与systemd active通过。

备份：`/opt/xingzhou-backups/storyboard-publication-2.8.143-20261110T092705Z`。

SHA256：storyboard-merge 01c10c1de64562ec6bf27e40e9f1f90b64a7246a3624c4460e28ff4568d2fdd4；collab 23d3dc5be3f1870f0417217911f0563ec405dd29b030cd6a4d670c99e35b9128；repository-extras 3a1ed40586bba066f5b0930f1049b10d145575eb3e18256fa5b6e8a3259d46dd。

首次阶段验证包含依赖客户端目录的v221跨端对照，因阶段目录没有客户端core而失败；发生在部署前。云端阶段仅运行适用的12项后部署，跨端对照已在本机全量通过。部署脚本带原hash断言、备份和失败回滚。

## 发布与安装

客户端实现ac43cd3已推送；公开发布中。官方包：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.143.exe
