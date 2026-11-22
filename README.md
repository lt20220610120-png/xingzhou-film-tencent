# 行舟影视（腾讯云版）

行舟影视是 Windows 桌面工作台，提供剧本创作、导演分镜、共享制作和 AI 影像生成。单人项目和本地媒体由桌面端保存，共享项目通过腾讯云协作。

开始开发前阅读[协作约定](AGENTS.md)、[开发交接手册](docs/开发交接手册.md)和[当前协作进度](docs/Hermes协作进度.md)，并核对实际 Git 与公开版本。

## 代码入口

| 路径 | 职责 |
| --- | --- |
| [src](src/) | React 工作区、导航和界面状态 |
| [core](core/) | 项目、导演、美术、生成与共享数据规则 |
| [electron](electron/) | Electron 主进程、preload、本地保存、生成服务及更新 |
| [cloud-backend](cloud-backend/README.md) | Node.js API、PostgreSQL 和 COS |
| [win-ai](win-ai/README.md) | Win AI 网关与行舟统一身份 |
| [world-simulation](world-simulation/README.md) | 原创和改写共用的世界模拟内核 |
| [scripts](scripts/) | 测试、安装包、签名及发布 |

## 本地运行

```powershell
npm ci
npm test
npm run build
npm run dev
```

## 发布

在 `release-notes/<版本>.md` 写本次发布说明。正式流程使用 `npm run release`。已经验证过的同版本安装包可交给 `python scripts/publish_release.py` 发布。发布流程与数据保护约定见[开发交接手册](docs/开发交接手册.md)，此前版本的说明和验收可按[历史发布档案](docs/archive/README.md)查询。
