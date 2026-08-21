# 行舟影视云端迁移骨架

本目录是腾讯云测试后端的最小安全骨架，当前只提供健康检查；尚未连接生产数据库、PocketBase 或 COS。

## 本地验证

```bash
API_SECRET=local-test npm test
```

## 服务器环境变量

复制 `.env.example` 到服务器的环境配置中，真实值只放在服务器或云平台 Secret 管理中，不能提交到 Git。

## 下一步

1. 导出 Supabase 数据库和 Storage 清单。
2. 确定 PostgreSQL（推荐）或 PocketBase 的目标模型。
3. 写登录/会话适配层的失败测试。
4. 写项目协作和媒体元数据迁移脚本。
5. 接入 COS 的短期上传签名。
6. 在腾讯云试用服务器建立隔离测试环境。
