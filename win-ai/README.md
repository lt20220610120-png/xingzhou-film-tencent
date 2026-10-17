# Win AI 0.1.0

行舟影视的独立 AI 中转站首版。模板确认为 [QuantumNous/new-api](https://github.com/QuantumNous/new-api)，使用官方 v1.0.0-rc.45 Linux 二进制，未修改上游程序。Win AI 首页、文档、品牌配置和部署脚本在本目录。

- 网站：https://winai.xingzhoufilm.cn/
- 控制台：https://winai.xingzhoufilm.cn/dashboard/overview
- 文档：https://winai.xingzhoufilm.cn/docs
- API Base URL：https://winai.xingzhoufilm.cn/v1
- 部署包：https://winai.xingzhoufilm.cn/downloads/Win-AI-0.1.0.zip

## 当前可用范围

已部署真实后台，包括渠道、模型、用户、API 令牌和日志。尚未配置任何真实上游，因此没有可调用的真实模型。充值、订阅购买与自助注册关闭，管理员可手动建立测试用户。协议兼容的中转站可以作为上游，私有协议需另写适配。后续的行舟影视专属栏目与付费不在本版；行舟客户端仍为 2.8.45。

本机普通域名 TLS 连接存在间歇性中断；不能据服务器内网成功宣称所有用户外网访问正常。为站点拥有者提供受保护的 SSH SOCKS 访问助手，使用已有 SSH 授权和独立 Chrome 配置，不改变系统代理或浏览器主配置。普通用户公开域名稳定访问仍需解决网络/接入问题，不能把该拥有者助手当作面向客户的解决方案。

## 本机打开与登录

双击 `打开WinAI网站.cmd`；管理员使用 `打开WinAI管理后台.cmd`。管理员用户名 **WinAIAdmin**。登录助手将本机 DPAPI 加密保存的密码复制到剪贴板，再打开登录页；它不把密码写入日志或显示在终端。首次保存从既有 SSH 授权读取服务器 root-only 凭据。修改密码后需同步更新凭据保存与本机缓存。

DPAPI 缓存为 `%LOCALAPPDATA%/WinAI/admin.dpapi.xml`，只能由当前 Windows 用户解密。服务器凭据在 `/etc/win-ai/admin.json`，会话/加密配置在 `/etc/win-ai/service.env`，均 root:root 0600。部署包不包含任何真实密钥或密码。

访问助手端口 `127.0.0.1:18319`，进程为指向已授权主机的 SSH。关闭独立 Chrome 后，可结束对应拥有者 SSH 进程；不应结束其他 SSH 连接。该助手仅用于站点拥有者本机，普通用户无需也不应获取服务器 SSH 授权。

## 部署与恢复

部署包包含官方 Linux 程序、原项目对应源码、许可证与本目录文件。已有授权的 Windows 主机运行：

```powershell
python scripts/deploy.py
```

`deploy.py` 固定使用既有 SSH key 与严格 known_hosts，打包时统一 LF，校验 upstream.json 的官方程序及源码哈希。未携带的官方制品从 GitHub 下载，也可复用本工作区 output/win-ai-research 缓存。目标 `/home/ubuntu/win-ai-stage-0.1.0`，先执行 `install.sh`，再 `publish-site.sh`。脚本仅适用于当前已授权腾讯云主机，不是任意新服务器的一键安装器。

独立目录：程序 `/opt/win-ai`，SQLite `/var/lib/win-ai/gateway.db`，日志 `/var/log/win-ai`。Nginx 配置 `/etc/nginx/conf.d/win-ai.conf`；证书 `/etc/letsencrypt/live/winai.xingzhoufilm.cn`，certbot DNS-01 自动续期；hook 读取既有服务器秘密，不复制云密钥。仅新增 `winai` A 记录，遇到冲突拒绝覆盖。

官方程序监听 8317，独立 `win-ai-port-guard` 服务通过 IPv4/IPv6 INPUT 规则拒绝非回环访问；Nginx 负责 HTTPS。systemd 限制内存 512M、CPU 80%。行舟服务、数据库与原有站点文件保留。

`publish-site.sh` 保存本站旧配置；语法、reload 或健康检查失败后恢复旧配置。首次无旧站则移除新增配置。Nginx graceful reload 期间旧默认站可能短暂响应，健康检查允许最多 5 次重试。更新前应额外备份 SQLite（使用 sqlite3 backup API）和 /etc/win-ai；不能仅复制正在写入的数据库文件。

## 验证

```powershell
python -m compileall -q scripts test
node --check public/site.js
```

`test/live-smoke.py` 在服务器检查品牌、地址、文档、注册关闭和鉴权。`test/mock-relay.py` 必须在独立网络命名空间运行：

```bash
sudo unshare --net sh -c 'ip link set lo up; exec python3 test/mock-relay.py'
```

测试用临时数据库与本地模拟上游验证非流式/SSE 转发、模型列表与上游密钥替换，不调用真实付费 API，不在生产渠道中写入测试模型。

`test/browser.cjs` 使用本机已安装 Playwright 与 Chrome，经拥有者 SSH SOCKS 验证真实 HTTPS 页面，证据写入工作区 output/win-ai-browser。它不证明普通公网域名线路稳定。详见 docs/verification.md。

## 开源声明

Frontend design and development by New API contributors.

New API Copyright (c) QuantumNous and contributors，AGPL-3.0。原始源码与许可证通过本站 `/source/` 提供；Win AI 版本配置和页面通过部署包提供。详见 upstream.json 的来源、哈希和改动说明。未复制 MaxForAi 的密钥、用户数据或专有运营内容。
