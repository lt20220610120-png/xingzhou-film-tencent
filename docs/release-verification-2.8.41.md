# 2.8.41 验收记录

日期：2026-10-16。基线 c278597（2.8.40），分支 codex/history-delete-toolbar-2.8.41。工作区原有未跟踪 docs/security-rating-2.8.4.md、output/ 保留，未修改用户项目资料。

## 行为与实现

- 导演历史页顶部新增删除全部入口，集数卡片和集内详情新增删除本集入口。复用 DeleteConfirm，确认显示范围和条数，取消不更改资料；独立按钮避免嵌套 button 和误打开卡片。
- 按点击时看到的提示词 ID 快照删除，保留确认后新生成的不同 ID。调用 deleteDirectorPromptsEverywhere 原子移除项目历史与分集对应提示词并保存删除记录，不删除剧本、分集或媒体文件。
- 回归发现仅存历史记录删除后，appendDirectorEpisodePrompts 仅检查分集 deletedPromptIds，会重新写回迟到的缓存；补上项目级 deletedPromptIds 过滤，新生成的不同 ID 仍正常加入。
- 资产页将标题、添加与分类切换组成左侧组，顶栏按底部对齐，操作控件统一 40px；较窄时自然换行，不更改生成范围和 API 参数。

## 已完成验证

- core/promptHistory.test.js 10/10。新回归先复现迟到缓存写回失败，再修正通过；覆盖按集删除仅存历史、保留其他集与其他项目、全部删除未编号与保存后回填。
- scripts/verify-history-assets-ui.cjs：真实 React 页面、隔离内存与 localStorage fixture，禁止外部网络。按集取消／确认、详情入口、删除后导出、重载保持、全部删除与空列表、其他项目及剧本保留通过。
- 2048、1600、1280、1120 像素布局验证：同排控件底部对齐、40px 高、无横向溢出；角色／场景／道具切换正常。真实生成请求 0，页面异常 0。
- 截图与报告：output/playwright/history-assets-2.8.41/；复跑先在 127.0.0.1:5801 启动 Vite，设置 XZ_PLAYWRIGHT_MODULE 到可用 Playwright 模块后运行上述脚本。

## 发布

全量测试、正式打包与公开发布结果在执行后补充。无云端部署需求。
