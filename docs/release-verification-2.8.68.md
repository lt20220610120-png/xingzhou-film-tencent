# 2.8.68 发布验收

日期：2026-10-24。

## 修复与实现

- 截图残留记录为 uncertain；旧前后端均排除待核对。现在已完成/失败沿用缓存清理，uncertain只归档并保存原任务ID/节点/状态/文件；list不返回归档记录。活动状态仍拒绝清理。
- save沿用已存archived；查询迟到不会复活。GenerationWorkspace递增请求编号忽略旧generationList响应。
- 设置页SettingsUtilityCards，临时素材按钮在右，版本以徽标展示；管理弹层复用原逻辑。
- SoftwareLicenseAdmin只改局部布局/文案；发卡与年度订单、导出、保存前禁止重复发卡、操作原因与confirmed协议延续。确认遮罩Portal到body。

## 验证

- 新增两条清理回归先失败、实现后13/13；含刷新/重启持久化、原任务身份/文件保留、迟到查询不复活、活动拒绝、共享引用、事务/文件回滚。
- 9Y旧迁移测试更新为只修正明确旧失败、真实待核对归档不变状态；设置版本测试覆盖新组件入口；专项19/19。
- 真实Edge、生产CSS、640/1280/1700/2232宽：清除4条(2待核对/1失败/1完成)、活动保留、刷新重启、真实GenerationWorkspace迟到列表不复活；设置按钮位置与弹层；授权空态/概览/年度月份参数/发卡/未保存拦截/导出/解绑原因及RPC参数通过，无页面异常。
- 独立复核：数据/付费防重/共享文件/授权协议无阻断；独立清理13/13和320/480/760/1024布局几何通过。
- 界面复验：npx vite build --config qa/release-2868-build.mjs；python -m http.server 5838 --bind 127.0.0.1 --directory output/ui-2868；node qa/release-2868-ui.cjs（先npm run build生成生产CSS）。结果output/ui-2868-verification.json。
- 没有删除用户真实结果或项目，没有调用真实收费生成；没有更改云端授权策略或数据库。

- 最终 npm test：2366/2366 通过；npm run build 成功（2091 modules）。
