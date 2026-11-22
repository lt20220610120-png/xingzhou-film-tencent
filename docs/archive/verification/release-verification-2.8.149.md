# 行舟影视 2.8.149 验收记录

日期：2026-11-11
主题：大型协作项目保存失败修复

## 根因

- “神明”项目 17 集，单次导演同步序列化后约 **17,596,315 字节（17.6 MB）**。
- `cloud-backend/src/server.cjs` 原请求体上限为 **16 MiB**，超过后直接 `request.destroy()`。
- 客户端收到断连或 Nginx 502 HTML，统一显示“云端未确认本次保存”，误判为网络/分流问题。
- 复现：12 MiB 无账号请求返回正常 JSON 401；16/18 MiB 返回 Nginx 502 HTML；18 MiB 未压缩上传耗时约 54 秒。

## 修复

- 云端口径由 16 MiB 提升到 64 MiB，同时限制压缩前和压缩后大小。
- 超过上限返回明确 JSON 413，不再断连形成假网络错误。
- 客户端超过 1 MiB 的网关请求自动 gzip 压缩，服务端安全解压并限制输出。
- 不改变项目保存业务语义、账号、分流、TUN 或系统代理。

## 测试

- 定向测试：`cloud-backend/test/server.test.cjs`、`cloud-backend/test/server-large-payload.test.cjs`、`electron/cloud-timeout.test.cjs`，覆盖 17 MiB、超 64 MiB、gzip 大型保存和非幂等写入不重放。
- 全量：**3018/3018** 通过。
- 构建：`npm run build` 通过。
- 安装包运行时：`packagedRuntime: PASS`。
- 真实写入：临时协作项目写入 300 万字符，保存 **680 ms**，回读长度一致，随后已删除。
- 公开网络压缩 18 MB 请求：**348 ms** 返回 JSON 401（原 54 秒/502）。
- LibTV 当前网络真实账号只读连续 **5/5** 成功；同时修复四个官方域名“全量预检任一失败即整体断连”的偶发故障，现保留可用线路并只在实际使用失败域名时按需重探。
- LibTV 回归：故障注入 `bridge.liblib.art` 超时仍允许账号连接；相关定向测试 **22/22** 通过。

## 云端部署

- 文件：`server.cjs`
- 备份：`/opt/xingzhou-backups/large-project-2.8.149-20261111T131532Z`
- 服务：`xingzhou-cloud-backend` active
- 部署后远端 SHA256：`5d835e8718bbc0879afe45ceb8bc274118ca1bab9d33a50d0a247107a9a8eed2`

## 安装包

- 大小：104,033,725 字节
- SHA256：`31cf27e2cb77bd07db6115b61392321f47778c654c81e1912fabea3500032201`
- 本机：`D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.149/Xingzhou-Film-Tencent-Setup-2.8.149.exe`
- 本机客户端已安装并运行 2.8.149；安装目录 `D:/行舟影视客户端/Xingzhou Film Tencent Edition`，其 `app.asar` 与最终包 `win-unpacked/resources/app.asar` 完全一致：22,681,344 字节，SHA256 `d915029c020c2673f466c5889fccb30fc20d12492e24637612da672dcd8ae89c`，且已确认含 gzip 上传与 LibTV 按需探测修复。

## 发布核验

- GitHub Release `441727741`：资产状态 `uploaded`，大小 **104,033,725 字节**，digest `sha256:31cf27e2cb77bd07db6115b61392321f47778c654c81e1912fabea3500032201`，与本机安装包一致。
- 官网镜像发布：`https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.149.exe`，发布时已通过 `UPDATE_MIRROR_VERIFIED` 校验。
- 三份 `latest.json`（官网及两个 GitHub main）已更新为 2.8.149。
- 软件内正式更新检测：官网 IP 更新源读取 `2.8.149` 成功，`newerVersion(2.8.149,2.8.148)` 为真，安装地址、大小、SHA256 与本版一致。证据 `output/review-149/in-app-update.json`。
- 公开下载完整包 SHA256 与本地一致；Range 请求返回 206，首 65536 字节逐字节一致；三份清单逐份通过 Ed25519 验签且内容一致。证据 `output/review-149/public-verification.json`。
