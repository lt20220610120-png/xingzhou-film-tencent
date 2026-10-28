# 2.8.92 发布验收记录

日期：2026-10-29

## 变更

已有提示词直接复用，不再重新生成或重复整本审核；已有美术清单和关联结果允许继续推进，单个问题进入待处理项并继续后续阶段。运行页新增可滚动的制作 Agent 工作日志，记录复用、继续和错误信息；全局大错误改为紧凑状态栏。

## 验证

- `npm run dist`：包含完整测试、构建和安装包运行检查；2496/2496 测试通过，安装包运行检查 PASS。
- `node scripts/verify-production-ui.cjs`：1280、1700、2232 三种宽度通过；覆盖 Agent 工作日志、自动滚动区域、阶段问题继续执行、暂停和视频池下载。
- 安装包：103882353 字节；SHA256 `ec8fe64a411e663611ede349bbd416f130b0970a8c49a39f22b78590ef9f1db7`。官方镜像、两个 GitHub 清单均为 2.8.92，签名、大小与 SHA256 已由 `update-trust.cjs` 校验一致。

## 发布地址

- 官方：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.92.exe
- GitHub：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.92/Xingzhou-Film-Tencent-Setup-2.8.92.exe
- 本机：`release/2.8.92/Xingzhou-Film-Tencent-Setup-2.8.92.exe`

## 限制

完整真实剧集的付费生成、Topaz 超分和 OpenFilm 成片仍需管理员在本机试跑验收；自动化测试使用模拟接口。
