# 2.8.64 发布验收

日期：2026-10-23

## 本次需求

- 图视生成的场景素材列表支持按单个素材恢复误删项；点击“↶ 恢复”只移除当前条目的对应 `excludedIds`，其他移除项继续保留。
- 图片、音频、视频共用同一恢复逻辑；切换提示词与重新载入后保存结果不丢失。
- 管理员制作工作流恢复视频模型选择；前端设置变化会使预跑结果失效，主进程与执行器再次校验工作流设置。

## 验证证据

- `npm test`：2342/2342 通过。
- `npm run build`：构建通过，Vite 产出 2086 modules。
- `node --test electron/admin-workflow.test.cjs core/promptBookRestore.test.js core/workflowPreflight.test.js`：10/10 通过。
- `node scripts/verify-restoration-ui.cjs`：Playwright 模拟接口通过；验证连续移除后单个恢复、条目隔离、刷新持久化、图片/音频恢复、工作流模型选择、预跑失效与归档终点限制。
- `node scripts/package-release.cjs`：2.8.64 NSIS 安装包构建并通过 packaged runtime smoke；管理员工作流权限门、关联桥和客户端启动自检通过。

## 范围说明

本版没有宣称已接入 Codex/WorkBuddy 桌面 Agent、Topaz 超分或 OpenFilm/CodeDance 自动剪辑执行器；总控面板会保存这些后续设置，但当前允许的运行终点是视频生成与按集归档。未执行真实收费生成、未修改用户项目。
