# 2.8.91 发布验收记录

日期：2026-10-29

## 变更

Agent 连接成功后自动选择推荐模型，优先选择 `gpt-6.1-sol`，没有时使用连接返回的第一个模型。用户仍可通过模型选择窗口切换。

## 验证

- `npm run dist`：包含完整 `npm test`、构建和安装包运行检查；2495/2495 测试通过，安装包运行检查 PASS。
- 安装包：103896146 字节；SHA256 `4503dc7b6942f3cbda3d76e9fa4c59b3abba90afafe2651df96e21ea8029e49a`。官方镜像、两个 GitHub 清单均为 2.8.91，签名、大小与 SHA256 已由 `update-trust.cjs` 校验一致。

## 发布地址

- 官方：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.91.exe
- GitHub：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.91/Xingzhou-Film-Tencent-Setup-2.8.91.exe
- 本机：`release/2.8.91/Xingzhou-Film-Tencent-Setup-2.8.91.exe`

## 限制

完整真实剧集的付费生成、Topaz 超分和 OpenFilm 成片仍需管理员在本机试跑验收；自动化测试使用模拟接口。
