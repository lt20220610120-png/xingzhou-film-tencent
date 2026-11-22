# 2.8.88 发布验收 · 2026-10-29

源码：458c358，分支 codex/monthly-license-legacy-exemption，已推送。自动化为管理员试用；项目视频池为常规项目协作功能。

## 已执行

- `npm test`：2491/2491，通过；包含部分阶段恢复、双击开始互斥、两集模拟归档/超分/剪辑交接、半自动 Agent 逐条检查、未知提交不重发、不完整集阻断、按范围导出与后期回执重启验证。
- `npm run build`：通过；Vite 大包提醒仍存在。
- `node scripts/verify-production-ui.cjs`：1280、1700、2232 三宽通过，检查开工门禁、启动/暂停、视频池过滤及下载范围，无页面异常或横向溢出。截图与报告在 output/playwright/furnace-2888-*。
- 本机 Codex app-server 握手/模型列表及极小只读任务实际返回成功。Topaz/OpenFilm 宿主预检 issues=[]。
- NSIS 安装包已重新制作，最终包含剪辑中断防重复调用保护。`scripts/package-release.cjs` 的实际安装包运行时检查通过，报告 qa/packaged-smoke-2.8.88-1793207275110。
- 独立复核发现并修正：部分失败误标完成、旧导演源未同步、全剧审核容量、半自动缺 Agent 检查、缺场误判齐全、未知提交无限轮询、原片仅验非空、后期状态仅内存及剪辑中断重复调用。

## 发布结果

- 官方：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.88.exe
- GitHub：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.88/Xingzhou-Film-Tencent-Setup-2.8.88.exe
- 本机：release/2.8.88/Xingzhou-Film-Tencent-Setup-2.8.88.exe
- 大小：103890403 字节。
- SHA256：d3d2bdadd4be0890b02b96a80dc0d86491f209b14ff0d72797cd7a2a3082485d。
- GitHub资产状态 uploaded、大小与 digest 相符；官方镜像发布脚本完整 SHA256 核对通过。官方 latest.json 和两个 GitHub main/latest.json 均通过客户端签名校验，版本、URL、大小和SHA256一致。公开安装包 Range 返回206，Content-Range总大小正确，文件头 MZ。

## 实际能力边界

未将模拟产物当成真实成片。尚未实际跑完整剧的付费提示词/图片/视频、Topaz 增强和 OpenFilm 剪辑联合验收。其他 ACP Agent 只有协议入口，须有对应组件再实测。内容拒绝不自动改年龄或强改画风；原任务未知先核对。剪辑已提交但尚未验收时保留已有工程并转待处理，不能无条件重复调用。

超分与剪辑使用已安装软件的命令接口完成等价操作，不依赖固定屏幕坐标。Topaz固定2/4倍，非自动裁切成1080p；最终剪法、字幕、尾帧及导出要求由用户统一指令提供。多版本导出效果仍需结合OpenFilm实际项目验收。
