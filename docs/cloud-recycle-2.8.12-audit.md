# 导演云协作与项目协作回收站检查

检查日期：2026-10-09；客户端 2.8.12，实现提交 4570223。仅检查，未修改应用逻辑、未部署、未调用真实云端删除或恢复接口。

## 已确认的隔离与权限

| 范围 | 删除入口与权限 | 回收规则 |
| --- | --- | --- |
| 本地创作、成品、本地导演与剧本库 | 本地项目卡 | 新本地回收站默认 7 天，可恢复 |
| 已开启导演云协作的导演文档 | 导演工作台的云端管理；仅该项目所有者可真正删除 | 独立云端删除，当前直接永久删除，不进入本地回收站 |
| 项目协作 | 项目协作的云端删除接口；仅项目所有者可删除、恢复 | 云端独立 3 天恢复期，超过期限由服务器清理 |

本地回收站拒绝带 cloudProjectId、collaborationProjectId 或 sourceType=cloud 的导演项目，项目卡隐藏其本地删除入口。项目协作不调用 projectRecycle/recycleProject，也不读取本地 7 天清理规则。服务端导演删除 SQL 要求 owner_id 匹配，受邀协作者不能通过本地回收站或云端删除接口越权删除。

源码证据：core/projectRecycle.js:21、:24；src/v06/DirectorWorkspace.jsx:83、:1097；cloud-backend/src/repository-extras.cjs:80、:312、:323、:365。

## 服务器只读核验

已使用现有 SSH 身份只读核验生产服务器：xingzhou-purge.timer 启用，OnBootSec=10min、OnUnitActiveSec=1h、Persistent=true。最近运行时间 2026-10-09 04:12:23 CST，Result=success、ExecMainStatus=0；下一次当时显示 05:12:23。ExecStart 为 /usr/bin/node /opt/xingzhou-cloud-backend/src/purge-expired.cjs。

规则是「每项删除后保留 3×24 小时，每小时检查清理已到期项」，不是每 3 天清空全部项目。生产 collab.cjs、repository-extras.cjs、director-source.cjs 的 SHA256 与当前工作区完全一致；生产 purge-expired.cjs 已只读查看，执行同一 purgeExpiredProjects 数据库清理函数。没有手工运行清理任务。

该清理函数删除过期项目数据库记录，并通过数据库级联删除关联记录；当前代码没有 COS 对象文件删除调用。因此不能把界面所说的“云端素材清理”解释成已经验证了 COS 原文件物理清除。

## 发现的问题及建议

1. **云端恢复期内删除导演源会导致协作项目无法恢复（既有问题）。** 导演源删除时只保护未删除的协作引用（repository-extras.cjs:89），但协作恢复时必须重新验证有效导演源（:332）。因此协作项目仍在 3 天恢复期时，可以删除导演源，随后协作恢复失败，即使尚未到期。独立内存 fixture 已复现，未使用真实项目。建议恢复期内继续保护导演源，客户端也显示“关联项目仍在恢复期”；期限到达后解除保护。保持服务器事务中的检查，不用本地快照替代云端授权。

2. **旧关联标记残留与新本地回收站衔接不完整（2.8.12 暴露）。** removeDirectorCloudProjection（core/directorCloudProjects.js:132）解除云端绑定后保留原本地稿，也保留 collaborationProjectId；关联同步（DirectorWorkspace.jsx:913）只添加标记，空列表直接返回。协作已过期、云端源也已删除后，遗留本地原稿仍可能被新回收站当成云端关联项目，删除按钮隐藏。纯函数复现：解除 cloudProjectId 后 collaborationProjectId 仍存在，isLocalRecyclableDirector=false。2.8.11 只按 cloudProjectId 禁止删除，所以没有表现出这个限制。建议在成功获取权威云端关联状态并确认关联确已解除/到期后清除残留标记；网络失败不能当作关联不存在，3 天恢复期内继续保留保护。

3. **项目协作界面权限与后端不一致（既有问题）。** 删除按钮按账号全局 isProducer 显示（CollabWorkspace.jsx:1408），并非按本项目所有者；受邀者若在别处拥有制片身份，也可能看到按钮，后台仍会拒绝。云回收站恢复按钮对所有成员显示且没有 try/catch（:1172）；无权恢复或源已丢失时，错误可能笼统显示“恢复窗口已过期”。建议删除/恢复按钮按本项目权限展示，捕获错误并区分无权限、源依赖失效和真正过期。

## 验证与结论

47 项相关现有测试通过，覆盖本地回收站、云端类型隔离、导演删除权限/锁定/引用保护及云恢复源依赖；独立只读复核确认以上问题。测试采用内存 fixture，无真实项目删除、恢复或付费模型调用。

两套回收站的存储、接口、期限互相独立，7 天规则没有覆盖云端 3 天规则；需要修复的是上述源依赖保护、残留关联标记和界面权限提示。用户本次要求检查并提出修复方案，这些修复尚未实施，也未发布新版本。
