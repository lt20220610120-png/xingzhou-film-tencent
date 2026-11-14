# 行舟影视 2.8.164

2026-11-14。基于 2.8.163（4078484），实现 4078484。针对大项目读取反复传输完整正文造成的云端请求超时，客户端保留更大的项目快照并使用版本校验，后续未变化读取只返回短响应。大项目读取首次等待时间延长，激活页遇到临时云端失败自动退避重试。

- 服务器日志中同一客户端出现大量 HTTP 499，表示客户端在大项目读取完成前主动结束请求。其项目响应原始体量约 55 MB，而旧客户端把超过 16 MiB 的快照丢弃，后续每次读取都重新传输。修复后默认快照容量为 96 MiB，项目版本未变化时走短响应。
- 针对大项目读取超时、授权临时失败和旧版条件读取协议增加回归。云端数据库、健康检查和网关目前正常，服务端不需要重新部署。真实项目未写入。
- 全量 3094/3094，Vite 构建、Electron 隔离界面、正式包运行、更新弹窗和安装回调通过。三份公开清单验签、GitHub 资产摘要、官网 Range 和源站 HTTPS 更新入口通过。Release 445136971。
- 安装包 104121199 字节，SHA256 `df650e5cefa83979fa7724611563b8c933bb4a8ec8cde14ab4d93fd27b6e76c9`。
- 官网 https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.164.exe
- GitHub https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.164/Xingzhou-Film-Tencent-Setup-2.8.164.exe
- 本机 D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.164/Xingzhou-Film-Tencent-Setup-2.8.164.exe
