# 行舟影视（腾讯云版）

这是行舟影视的新部署版本：桌面端保留原有剧本、导演、AI 影像生产和协作界面，账号、项目和媒体数据全部使用腾讯云环境，旧 Supabase 数据不参与本版本。

## 架构

- Electron + React + Vite：Windows 桌面客户端
- Node.js：腾讯云 API
- PostgreSQL：账号、项目、成员、资产、任务、消息和媒体元数据
- COS：图片、视频和导出文件
- Nginx：静态前端和 API 反向代理

## 目录

- `electron/`：桌面主进程、登录和协作客户端
- `src/`：React 页面和业务界面
- `cloud-backend/`：腾讯云 Node API、数据库 schema 和测试
- `deploy-nginx.conf`：腾讯云 Nginx 配置
- `build/`：应用图标和安装器资源

## 本地验证

```bash
npm install
npm test
npm run build
```

## 发布更新

每次对外发布统一执行 `npm run release`。命令会先运行全量测试、构建前端、打 Windows 安装包，然后创建或复用 GitHub Release、上传当前版本安装包，并更新仓库根目录的 `latest.json`。软件设置页读取这个清单，所以不能只运行 `npm run dist` 后把安装包单独发给用户。

管理员可在“管理后台 → WorkBuddy 号池”中直接使用本机 WorkBuddy Manager；默认的“用户与邀请码”页签保留原有功能。首次进入自动读取本机已有快捷方式，也可选择部署目录。行舟会验证当前管理员身份并创建独立短期面板会话，不需要再次输入面板密码；微信/QQ 的 WorkBuddy 账号授权仍在面板的账号管理中完成。

号池页签顶部提供“检查更新”及确认安装入口。更新从 `ithtelab/workbuddy-manager` 的正式 GitHub 发布读取签名 tar 包，验证后使用预构建网页，准备独立候选 Python 环境、替换面板代码并重启；失败恢复原版本。账号、数据库、配置和既有 Go 引擎保留。资料路径若与代码目录重叠，会先拒绝更新并说明原因。本机仍须保留原有面板部署与 Python 运行环境；行舟安装包不包含账号凭据或第三方运行环境。

发布说明可提前写入 `release-notes/<版本号>.md`；没有该文件时，脚本会使用默认说明。发布前要确认 GitHub 凭据可用，且不要在同一版本重复使用错误的安装包。

## 腾讯云部署

服务器端真实密钥只放在 `/opt/xingzhou-cloud-backend/.env` 或云端密钥管理中，不能提交到 GitHub。客户端只包含公开 API 地址，不包含 PostgreSQL、COS 或管理员密钥。

当前正式切换前还需要配置域名和 HTTPS；不要把仅 HTTP 的公网地址用于真实员工账号。
