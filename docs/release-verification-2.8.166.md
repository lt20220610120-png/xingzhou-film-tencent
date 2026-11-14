# 行舟影视 2.8.166

2026-11-14。基于 2.8.165（396374e），实现 b9bf479。修复免卡管理员旧会话失效后只能停留在卡密页的问题，激活页提供已有账号登录入口。管理员重新登录后按服务器免卡状态进入软件。

- 实机核对发现旧管理员会话已被服务器判定为 401 失效，管理员账号 xingzhou510 本身仍在免卡豁免表中。旧会话失效后，原激活页没有登录入口，导致管理员只能看到卡密输入框。
- 激活页新增已有账号登录入口，登录成功后重新进行授权检查，免卡管理员可直接进入工作台。真实账号密码未在测试中记录或输出。
- 全量 3095/3095，Vite 构建、Electron 隔离界面、正式包运行、更新弹窗和安装回调通过。三份公开清单验签、GitHub 资产摘要、官网 Range 和源站 HTTPS 更新入口通过。Release 445175107。
- 安装包 104121579 字节，SHA256 `013610afdb107f41380d4328413043581ad09f63cd73833cb26c1a10ed320778`。
- 官网 https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.166.exe
- GitHub https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.166/Xingzhou-Film-Tencent-Setup-2.8.166.exe
- 本机 D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.166/Xingzhou-Film-Tencent-Setup-2.8.166.exe
