# 2.8.89 发布验收记录

日期：2026-10-29

## 变更

管理员制作总控改为五步设置工作台。项目、模型和 Skill 通过搜索选择窗口选择；输出、Topaz、OpenFilm、Agent、音乐和音效通过桌面选择卡片选择或清空。制作与剪辑智能体显示连接状态，剪辑可以沿用制作智能体。重新连接或模型列表变化会使旧预检失效；空模型列表不能开工。

## 验证

- `npm test`：2492/2492 通过。
- `npm run build`：通过；Vite 仍提示产物主包较大，未影响构建。
- `node scripts/verify-production-ui.cjs`：1280、1700、2232 三种宽度通过；覆盖真实 `.admin-panel` 容器、项目页与后期页横向溢出、选择窗口搜索/关闭/Escape/焦点恢复、路径取消与清空、连接失败、Agent 切换、空模型阻断、预检启动/暂停和视频池范围下载。
- `node --test electron/production-host.test.cjs`：2/2 通过；目录窗口标题、默认位置、可新建、取消和账号变化复核通过。
- 安装包：103881691 字节；SHA256 `39c1001a501230eb5877518bf9ea96db2960e9be759191adf035c70903627187`。官方镜像、两个 GitHub 清单均为 2.8.89，签名、大小与 SHA256 已由 `update-trust.cjs` 校验一致。

## 发布地址

- 官方：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.89.exe
- GitHub：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.89/Xingzhou-Film-Tencent-Setup-2.8.89.exe
- 本机：`release/2.8.89/Xingzhou-Film-Tencent-Setup-2.8.89.exe`

## 限制

本次是管理员工作台交互改版。完整真实剧集的付费提示词、图片、视频、Topaz 超分和 OpenFilm 成片仍需管理员在本机试用验收；测试使用模拟接口。
