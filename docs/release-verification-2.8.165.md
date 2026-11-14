# 行舟影视 2.8.165

2026-11-14。基于 2.8.164（4078484），实现 396374e。修复腾讯云版切换用户数据目录后，旧版管理员登录会话未迁移，导致管理员被错误要求输入卡密的问题。启动时安全迁移旧目录中的登录会话和授权设备状态，已有新目录状态不会被覆盖。

- 服务器免卡账号核对确认 xingzhou510 为管理员且在免卡表中。故障电脑的旧登录会话位于 AppData/行舟影视/cloud-session.json，新版本使用 AppData/行舟影视-腾讯云版，启动时未迁移是截图所示卡密页的直接原因。
- 启动迁移只复制旧目录中缺失的会话、设备密钥、卡密记录和路由提示文件，已有新目录文件不会覆盖。迁移逻辑有回归测试，真实账号文件未在测试中改写。
- 全量 3095/3095，Vite 构建、Electron 隔离界面、正式包运行、更新弹窗和安装回调通过。三份公开清单验签、GitHub 资产摘要、官网 Range 和源站 HTTPS 更新入口通过。Release 445149166。
- 安装包 104137614 字节，SHA256 `4b05d1fa1e1da4de8cac024f25cc65db3321217ea67afb6e4a2dd2ca0d59011c`。
- 官网 https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.165.exe
- GitHub https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.165/Xingzhou-Film-Tencent-Setup-2.8.165.exe
- 本机 D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.165/Xingzhou-Film-Tencent-Setup-2.8.165.exe
