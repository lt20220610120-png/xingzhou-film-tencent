# 行舟影视 / XINGZHOU FILM

行舟影视是面向内容创作者与导演的本地优先 Windows 桌面应用，包含果子库、剧本创作、剧本库、导演工作台、Skill 库、API 接口和持久 AI 对话。

本仓库同时保存可维护源码和软件内更新清单。

## 源码目录

- `src/`：React/Vite 界面源码
- `core/`：可测试的领域逻辑
- `electron/`：Electron 主进程、preload、更新服务与测试
- `build/`：Windows 图标与 NSIS 安装配置
- `latest.json`：软件内更新使用的稳定清单

## 本地开发

```bash
npm install
npm test
npm run dev
```

## 构建与打包

```bash
npm run build
npm run dist
```

用户项目、Skill、API 配置和聊天记录保存在安装目录之外的本地资料目录。覆盖安装只替换软件程序，不应删除用户资料。
