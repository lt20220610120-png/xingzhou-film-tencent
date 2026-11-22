# 2.8.146 发布验收（2026-11-11）

## 需求及最终实现

- ProjectResourcePicker：只有当前账号有编辑权的本地参考上传允许确认删除。保护项目已采用图/音色、对象别名、他人媒体、发布来源、活动任务和待发送队列引用；账号/项目锁定/来源在服务端事务再次核验。记录删后发COS DELETE，清当前引用；取消选择弹窗不复活已删素材。删除失败保留卡片；对象清理失败明确返回warning。
- 主进程持久化storyboard批量队列：场景/分集/全剧；每条保留正文及引用，上方参数共用；跳过已有成功/活动/待核对任务，费用确认后发送。停止仅未发送，恢复显式操作，重启准备中标uncertain而非自动重发；原生最终dispatch及Fnko付费边界核验。逐条保存有requireExactBase事务基线，防schema等待期间覆盖协作者工作。历史批次不会清新草稿，已跳过条目不清草稿。
- 建议时长元数据贯通导演快照/发布/分镜，旧稿仅准确来源ID及原文匹配恢复，不按标签推测。建议时长按scene/episode/project范围逐条应用，支持小数；不支持/缺失保留标记并阻止生成，不向默认值回退。统一参数模式和按集应用保留；默认参数变化只对准确默认delta安全重设dirty草稿基线，正文或引用差异继续冲突保护。
- 顶部单一生成设置面板：紫色主操作/浅色辅助按钮/参数应用图标组、统一圆角与焦点反馈；接口/参数/建议/队列同容器，收起约54px；记住账号+项目的状态，键盘可展开，收起显示模型/默认时长/批量进度。1280/1700/2232无横向溢出。
- OFF官网IP健康检查改回CA/证书指纹正确链路；官方和COS安全只读可自动绑定物理网卡备用，不影响模型。写入不因模糊失败重试；缓冲同对象PUT可安全处理，流式上传单次。
- LibTV bundled Node CLI在当前WiFi复现ECONNRESET（api2.liblib.art/api.liblib.tv），Chromium和CLI不共享代理。命令前无凭据TLS探测普通/系统代理/物理线路；有随机认证的本机CONNECT仅转发LibLib官方域名及核实的指定OSS桶/canva.xingliu.art的443端口，TLS端到端验证，记录实际验证成功的DNS IP。每个原生命令只启动一次，失败仅输出安全域名/错误码。开关文案TUN模式兼容；不更改Clash/TUN/用户代理或凭据。

## 验证证据

- npm test：2991/2991，13 suites，output/146-tests-final.log；构建output/146-build-final.log通过。
- scripts/verify-storyboard146-ui.cjs：实际React+原生queue host+backend merge，桥接仅隔离fixture，真实API/付费调用0。自己的素材删除/保护/确认失败重试/Escape/取消；12/17秒分别精确应用、unsupported阻止提交、missing报告、uniform重置；scene/episode/drama、草稿、跳过、排队/生成/完成、stop/resume；折叠<64px、键盘、重开状态及三宽通过。报告及截图output/playwright/storyboard-2.8.146。
- 网络只读output/146-network-readonly-after.json：OFF健康200、项目12/资产279，实际COS image1,576,015字节，Chromium/物理/自动读取200。
- output/146-libtv-readonly-after.json：当前WiFi实际原设置enabled=true，测试注入OFF而不修改设置；OFF账号、视频模型37/图24、live schema、项目列表、画布370nodes（10.59s）、已有视频任务query（6s）成功。无系统代理子路径账号成功、ON兼容账号成功。设置/加密凭据哈希不变；0生成/上传/项目写入。未假称测试前用户TUN状态；不是热点替代验证。
- 独立复核修复队列旧基线、Fnko付费guard、重启不确定状态、历史确认清新稿以及事务保存竞态；最终复核见后续收尾。

## 云端部署

- 增量6文件 media.cjs/postgres-repository.cjs/reference-upload-delete.cjs/storyboard-merge.cjs/storyboard-settings.cjs/prompt-duration.cjs；备份 /opt/xingzhou-backups/storyboard-2.8.146-20261110T175520Z。阶段43/43通过并health active。
- 追加原子基线merge补丁，备份 /opt/xingzhou-backups/storyboard-atomic-2.8.146-20261110T175644Z；阶段44/44通过，health active。日志output/146-cloud-deploy.log、146-cloud-atomic.log。原线上与HEAD差别仅CRLF已核对；原始哈希前置保护，失败自动回滚。无schema迁移，无真实删除或生成。

## 安装包与公开发布

最终NSIS安装包运行验收通过：qa/packaged-smoke-2.8.146-1794335160301/report.json。本地包release/2.8.146/Xingzhou-Film-Tencent-Setup-2.8.146.exe，104083650字节，SHA256 `8cf0151c8044a9feffb50b1dc854b195d2d17080bdf2f7fef9428eef9da72766`。独立最终复核24/24通过，无阻塞问题。公开验收全部通过。

- 公开清单切换前收到用户追加按钮美化，暂停首次上传并重新制作最终包；最终按钮/生成设置标题/三宽UI再次通过，2987再次全绿，最终NSIS运行通过，旧构建未进入更新清单。

- 最后网络回归补齐官方CLI上传bridge、精确OSS桶和canva.xingliu.art分支；动态媒体TLS预检并保留verifiedIP。其他桶、内网端点、其他xingliu域名/伪后缀拒绝；针对70/70、最终全量2991/2991通过。最终NSIS包重制并运行通过。
- 真实已完成1-6-1在当前WiFi注入OFF路径：query13.16s、CLI download31.82s，MP4 9,585,882字节，SHA256 3dd88c1576eb7ff9b0588a0acae56165fa52a304c630af80748e052727da285a；与145原片导出逐字节相同，ffprobe17.056s/H264/AAC。证据output/146-libtv-verified-download.json、output/review-146/download-validation.json。首轮空节点明确无可下载资源，未误归因为网络失败。
- 两个精确OSS上传目标只读HEAD：CONNECT200、TLS有效、服务端403（匿名无签名），证明通道可到服务端；没有真实PUT上传或付费生成。证据output/146-libtv-upload-transport-readonly.json。原账号凭据保持。

- 实现1d42416、视觉8320d51及媒体网络f05a683已推送，GitHub Release 440720125，安装包uploaded，资产digest与本机一致。官网/两个GitHub公开latest.json逐字一致并验签，官网服务器完整SHA256及公开Range206前65536字节与本机一致。证据output/review-146/public-verification.json。
- 生产更新读取已检测到2.8.146，来源https://106.55.41.128/api/updates/latest.json，保留签名/CA/证书指纹校验。证据output/review-146/in-app-update.json。
- 官方包 https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.146.exe
- GitHub包 https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.146/Xingzhou-Film-Tencent-Setup-2.8.146.exe
- 发布期间以本机SSH绑定WLAN透传GitHub TLS，凭据始终在本机TLS内，临时QA/上传通道用毕关闭，用户Clash/TUN及本机网络设置保留。未强制关闭或替换用户运行中的客户端。
