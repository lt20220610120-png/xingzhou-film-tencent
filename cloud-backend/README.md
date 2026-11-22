# 行舟影视腾讯云后端

腾讯云上的 `xingzhou-cloud-backend.service` 从 `/opt/xingzhou-cloud-backend` 启动。Nginx 将桌面端 `/api/gateway`、Win AI `/api/win-ai/` 和公开健康检查 `/healthz` 转发给 Node 服务。PostgreSQL 保存账号和协作数据，腾讯云 COS 保存项目媒体。

## 本地验证

```bash
npm ci
npm test
```

在空的隔离 PostgreSQL 数据库中用 `schema.sql` 初始化。已有部署按发布说明应用所需的 `migrations/` 脚本。运行 `npm start` 前按 `.env.example` 设置环境变量，真实值由服务环境管理。

## 更新和回滚

更新前备份当前运行的 `src/` 与 `shared/`。在隔离环境通过启动和接口验证后，把同一发布版本的两个目录一起切换，随后检查服务状态和 `/healthz`。应用更新失败时一起恢复备份的两个目录并重启服务。

历史 Supabase 初始化、边缘函数和容器部署文件可从 2.8.196 源码提交 `e900e68` 取回。线上 PostgreSQL 和 COS 中的历史记录仍由腾讯云服务读取。部署入口和完整发布步骤见[开发交接手册](../docs/开发交接手册.md)。
