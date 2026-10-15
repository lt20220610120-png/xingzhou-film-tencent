# 2.8.40 分集冲突恢复与主动核对验收

日期：2026-10-16，基线6f687d7，分支codex/episode-conflict-recovery-2.8.40。

## 根因与行为

实际项目的导演源存在两份内容不同的第24集，协作项目另保留一份同号旧副本。前版严格编号检查用于渲染时直接抛错，根错误边界显示“工作区加载失败”；重新加载恢复同一项目和数据后再次触发，形成循环。用户确认原中英双语版为主稿，同时要求异常时也能检查、编辑、删除或选择主稿。

严格编号校验仍用于生成/发布/同步写操作；查看与进度改用有问题条目隔离的inspect，保留原数组和完整冲突版本，不自动重编号。项目顶部新增分集核对/编辑/主稿/移入历史面板，所有已授权分区可访问；历史正文和旧总剧本可查看复制，权限不足与锁定时只读。信息页外部主稿更新可同步未改过的编辑器，未保存输入继续保留。

新增episode-identity-resolve事务接口，重核制片权限、锁/回收站、导演域引用和完整episodes基线CAS；过时409不覆盖。修正保留所选ID与完整历史，分镜ID/配置及删除标记处理可恢复。历史不嵌套复制自身，旧嵌套历史扁平保留。明确移除或改号的源记录不会后台复活。导演源编号冲突时GET返回当前项目及临时warning，非编号网络/权限错误不吞掉。

## 验证

- 4项核心恢复红绿测试：分离歧义、渲染进度不抛错、旧核实记录保留、无效本机源不上传；相关55项通过。
- UI SSR及桥接测试；完整React浏览器两组模拟覆盖所有分区、主稿、编辑、移入历史、409局部错误、角色和锁、重载不循环、900/1280布局。真实坏项目快照3份第24集、127资产模拟通过，0真实API/0页面错误，私有报告output/playwright/episode2840-real/report.json。
- 独立复核指出历史指数增长、改号旧稿复活、主稿分镜被删除标记过滤后历史缺失三项问题，均加红绿回归修正；最终复核18项通过，无剩余阻断。
- 最终npm run dist：2166/2166，0失败；前端构建、NSIS打包、安装包运行通过。运行报告qa/packaged-smoke-2.8.40-1792092363727/report.json。首轮因旧同步测试fixture没有集号被正确拦截，补齐有效集号后全量通过；未放宽生产编号检查。
- 云端Linux专项、真实PostgreSQL临时表主稿/权限/CAS/锁/回收站/历史/核实保留验证通过。部署四文件repository-extras.cjs、collab.cjs、collab-episodes.cjs、episode-identity-repair.cjs，无schema迁移；健康active，回滚/opt/xingzhou-backups/episode-identity-2.8.40-20261015T192735Z。

## 安装包

release/2.8.40/Xingzhou-Film-Tencent-Setup-2.8.40.exe，103612894字节；SHA256：d9e03fa6641cabd2f78b61e6e2af20e2ff86d45ec87867212c1904234ad69074。

公开地址：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.40/Xingzhou-Film-Tencent-Setup-2.8.40.exe 。真实数据整理、发布和本机安装结果随后补充。私有原稿/快照仅在本机output/episode2840及用户备份，不提交源码。
