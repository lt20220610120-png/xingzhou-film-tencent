# 2.8.90 发布验收记录

日期：2026-10-29

## 变更

移除管理后台旧版接续任务入口；新版炉子新增默认剪辑设定。默认指令会把项目剧本、镜头顺序、粗剪、音效、每集至少两首配乐、前 3 集首次人名条、国内／海外字幕和尾帧要求写入 OpenFilm 制作任务。新增音色目录与指定尾帧文件；国内剧使用竖条人名条和中文单行字幕，海外剧使用横条人名条和最多两行字幕。

## 验证

- `npm test`：2495/2495 通过。
- `npm run build`：通过；Vite 的大包提示仍存在，不影响构建。
- `node scripts/verify-production-ui.cjs`：1280、1700、2232 三种宽度通过；覆盖默认／自定义剪辑设定、国内／海外剧切换、默认／指定尾帧、音效音乐同行、音色目录、弹窗、预检、启动暂停和视频池下载。
- `node --test core/editingPresets.test.js electron/production-host.test.cjs`：5/5 通过；覆盖国内／海外规则、默认伪帧、自定义指令、媒体尾帧选择和目录账号保护。
- 安装包：103895789 字节；SHA256 `350a9a14843bb547d155f8f61b18d1edbfc3179d2382c046f14b81af0a366e3d`。官方镜像、两个 GitHub 清单均为 2.8.90，签名、大小与 SHA256 已由 `update-trust.cjs` 校验一致；官方 Range 返回 206。

## 发布地址

- 官方：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.90.exe
- GitHub：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.90/Xingzhou-Film-Tencent-Setup-2.8.90.exe
- 本机：`release/2.8.90/Xingzhou-Film-Tencent-Setup-2.8.90.exe`

## 限制

完整真实剧集的付费生成、Topaz 超分和 OpenFilm 成片仍需管理员在本机试跑验收；自动化测试使用模拟接口。
