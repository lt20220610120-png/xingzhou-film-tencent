# 2.8.168 发布验收（2026-11-15）

## 范围与原因

基于上一公开版本 2.8.167（217deb3），实现 4b21953、f5df292。针对分镜生成前保存未确认，以及 LibTV、FT、自定义视频接口在代理切换后网络行为不一致进行公共链路修复。

- 历史 148/149/158 的经验保留：跟随系统代理、单个 LibTV 主机故障不阻断全部主机、媒体域名单独路由，不新增要求用户调试的 TUN 开关。
- 后端实际流量记录显示单条 storyboard-patch 曾返回整项目 22,751,549 字节，gzip 后仍约 2.7 MB。实际写入可能已成功，但回包中断使前端无法确认；此时还没有执行任何模型提交，换模型不能解决。
- 云网关、FT/旧飞拓、自定义视频、COS 直传原有部分请求走 Node fetch，素材读取走 Chromium，两类请求对系统代理/PAC 行为不同。

## 修改

1. 云网关和通用 API 请求使用桌面网络传输；显式 API 凭据不继承浏览器 Cookie。Win AI 的独立传输继续保留。各视频协议共用上传、提交、查询和下载通道。
2. Chromium 不支持 fetch 的 manual redirect；需要逐跳鉴权的 GET 沿用现有 net.request 适配器，不能简单全部替换成 net.fetch。
3. 分镜普通单条保存选择短回执；旧客户端仍获得完整项目。服务器仍执行原权限、锁及冲突检查。前端只合并对应发布批次的分镜，保留其他场景最新状态，首次直接保存保留导演源原文。
4. 保存回包不明时只读核对同一条云端分镜：账号未变化、发布批次与每个提交字段完全一致才确认。未通过则保留草稿并阻止生成。不会盲目重放写入。
5. LibTV 账号、模型和节点只读请求遇到网络错误重新探测并重试一次；创建、上传、生成不重放。既有持久化任务继续查询原任务。

## 验证

- 最终 npm test：3104/3104，0 失败；npm run build 成功。
- 新增跨协议公共传输、multipart/取消/凭据隔离、原生跳转、回执丢失核对、内容/发布批次/账号变化和权限拒绝回归。
- 真实隔离 Electron 网络测试：本地直连、隔离会话 HTTP 代理（不需系统 TUN）、代理切换、multipart 字节、Cookie 隔离和手动下载跳转通过。不是穷举所有 VPN 软件。
- 实际 React 分镜组件依次切换 custom→FT→LibTV→custom，每次先保存当前参数再提交；模拟保存失败阻止第五次生成，发布批次及场景保留。使用模拟生成接口。
- 正式 NSIS 包运行验证 PASS，9 个关键 ASAR 模块与源码逐字节一致。包含启动、权限、视频接口、LibTV、下载、媒体播放、画布等既有检查。
- 本机真实只读：授权路由、session、summary 项目列表（10 项）、完整项目、短分镜回执成功；本条回执 47,286 字节。LibTV 原账号有效，26 个图像模型、38 个视频模型，视频 schema 可读。
- 只读诊断最初省略 summary 并限制 15 秒，导致全列表大包读取超时；该请求与产品列表调用不同。改为正式调用参数后列表通过；首次完整项目读取仍遇到一次瞬时失败，后续正式路径复验成功。公网抖动和服务端故障仍可能发生，不能宣称所有外部请求永不失败。
- 用户真实工程未写入，未支付生成。LibTV 凭据仅复制到临时诊断目录，使用完重新加密；未修改原账号配置。隔离加密测试最初因 Local State 不匹配失败，之后使用产品同名应用上下文，只读解密成功。

## 云端与发布

- 仅部署 cloud-backend/src/collab.cjs，无数据库 schema 变更；原版本备份 /opt/xingzhou-backups/collab-20261114T155928Z。
- 线上文件 SHA256：9e3b20edb0b78a2a224738c1032bd3b197854e3cb03b5072fbf13966884f51c3；服务 active，/healthz 正常、PostgreSQL select 1 正常，系统盘剩余 13 GB。
- 安装包 104121092 字节；SHA256 `0ed39b7644ce3e8ad1159c7d581a4a2ecdd8bced405f2c44b15ed1b4e2f76f46`。
- GitHub Release 445749887；上传工作流 43666264362 成功，资产 uploaded/digest 一致。
- 官网与两个 GitHub latest.json 签名及内容一致；官网 Range 206 与本地字节一致；软件更新器也可从固定证书 IP 入口获取一致清单。
- 实际隔离更新弹窗 2.8.154→2.8.168 通过：真实官网 Range 续传尾部 64 KiB、整包校验、安装回调。没有强制替用户安装或重启正在使用的客户端。
- 官网 https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.168.exe
- GitHub https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.168/Xingzhou-Film-Tencent-Setup-2.8.168.exe
- 本地 D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.168/Xingzhou-Film-Tencent-Setup-2.8.168.exe

## 交接边界

本次统一传输和保存回执，不按模型名称硬编码网络路径。已有协议的新地址/模型继续用现有接口配置；全新鉴权或协议仍可能需要适配。第三方服务故障、额度、账号权限或不支持参数必须独立诊断，不能靠换代理或重复收费请求掩盖。若以后改动公共网络层，应同时运行跨接口回归及真实 Electron multipart/manual redirect 验证。

运行证据位于本工作区 output/168-test-final.log、168-build-final.log、168-package-final.log、168-ui.json、168-network-runtime.json、168-real-readonly.json、168-public.json、168-update-ui.json；测试源码已提交。发布暂存和诊断输出不进入安装包。
