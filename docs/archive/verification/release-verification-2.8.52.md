# 行舟影视 2.8.52 验收记录

日期：2026-10-20；基线84407db（2.8.51正式版）；分支codex/image-result-recovery-2.8.52。

## 原因与边界

- 只读检查本机32份旧图片下载恢复记录；抽查两个最新地址，均返回HTTP477 / JSON `image_download_failed`，正文“源图片不存在或已过期，无法下载”；另一个旧地址404 / image not found。未提交生成请求，未传上游Key给媒体域名。诊断明细在私有output/，不提交结果URL或用户项目。
- 原实现把477归为本地save错误，并仅凭接口返回URL就说“图片已生成”。现保留HTTP状态和有界、脱敏的JSON原因，区分upstream/network/invalid/save。URL仅证明收到地址；实际字节与解码成功才作为有效图片；无法证明上游曾生成成功，也不能恢复已不存在的上游文件。
- 不更改用户项目、不删除旧恢复记录、不批量生成；手动放弃只清除该资产恢复绑定，必须另点生成才提交新请求，可能收费。

## 实现

- AssetImageBox为美术/资产共用恢复面板，跨父网格整行。两行固定等宽等高按钮：重试取回原图/上传原图，打开结果地址/放弃旧结果；短文案、明确费用提示和二次确认。文件已取回但挂载未完成、任务仍在运行等恢复状态同样可继续或主动放弃。
- 477/403/404等上游错误不再建议检查磁盘。GET只沿既有有限重试策略读取，477不自动循环；恢复不重发付费POST。错误页面、空文件和损坏图片不能保存为有效结果。
- GPT/DALL-E兼容接口优先b64_json；官方GPT接口不传不支持的response_format，使用官方内嵌默认。参考图顺序/edits不变。任何格式请求失败均不自动变参重发，其他模型保留URL格式。
- 原子保存到稳定receipt文件名；下载成功后保留恢复依据，IPC回传或项目挂载前中断可重用已验证本地文件，避免重下或重生。恢复记录不保存API Key。
- Electron PNG/JPEG使用nativeImage校验；WebP/GIF/AVIF用短生命周期、离线data-only CSP的sandbox Chromium图片解码，15秒截止并销毁。第三方结果不进入仅限本应用签名COS图片的缓存，保持原账号与权限边界。

## 已执行验证

- 新增回归先红后绿：477原JSON原因、HTML200不当图片、GPT内嵌请求、官方GPT默认、其他模型不改、空文件、真实图片落盘/恢复、断点缓存、本地ENOSPC、一次POST及主动放弃后下一次单独提交。原FT/LibTV/过期记录/参考图传递保护保留。
- 生产完整CSS与真实React/Edge离线模拟：1280、1700、2048宽度；四按钮不溢出，两行等宽等高34px；打开只读地址、重试不重复POST、取消放弃保持状态、确认放弃不立即生成、下一次点击才提交、取回后挂载成功，页面错误0。证据output/art2852-ui-verification.json及art2852-*.png。
- 独立只读复核发现nativeImage不支持有效WebP/GIF/AVIF，已改Chromium解码。真实Electron复核三格式与PNG成功、保留签名但截断文件均拒绝、并发解码通过、所有临时窗口销毁，无剩余阻断。未使用真实付费接口。
- 最终全量npm test执行2255项，2253通过；两个未改动的Windows桌面/进程生命周期夹具在并发环境失败（最小化窗口时序、短命进程PID身份回收）。相关两份套件串行复验25/25全部通过，未跳过或放宽断言；本次图片恢复聚焦20项通过。保留原失败日志output/tests-2852-final.log与复验证据output/windows-2852-sequential.log，不将并发原日志描述为0失败。
- npm run build通过。最终NSIS打包、ASAR私有Skill正文/用户数据保护扫描、实际安装运行时通过：qa/packaged-smoke-2.8.52-1792458880918/report.json。PNG/WebP/GIF/AVIF和错误页校验、视频Range206/播放拖动/下载同字节、纯净客户端与权限隔离、Win AI交接均通过。首次包校验发现旧1px测试PNG本身不可解码，换真实PNG；第二次发现新增解码窗口被测试监听器重复当作主窗口，改为只验证首个主窗口，真实产品解码不受该夹具问题影响。
- 安装包103745137字节，SHA256 ba1a1cb546cca923e811717b1cd352a9ba081e1f345decc4818b2008f9e605aa。公开更新验证结果在发布后补充。

## 发布

- 功能5c3dcbc，正式签名清单e0fee8a，版本2.8.52；非草稿、非预发行。公开安装包：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.52/Xingzhou-Film-Tencent-Setup-2.8.52.exe 。本机包：C:/Users/11599/Documents/ChatGPT/行舟影视/tencent/release/2.8.52/Xingzhou-Film-Tencent-Setup-2.8.52.exe 。
- 两份公开main更新清单完全一致，版本、安装包URL、103745137字节及SHA256 ba1a1cb546cca923e811717b1cd352a9ba081e1f345decc4818b2008f9e605aa 与本地相同；GitHub资产digest和HEAD200/Content-Length均通过。证据output/release-2852-public.json。
- 真实软件更新传输器验签通过，2.8.50/51均能发现2.8.52，2.8.52不重复更新；官方IP镜像Range206/65536字节及总长一致。证据output/storyboard2852-inapp-update-verification.json；沿用既有域名TLS回退及固定信任，没有绕过证书验证。
- 根软件更新记忆、开发交接手册已同步。未关闭/替换用户当前窗口；用户可通过软件内更新或公开安装包安装。保留所有无关Win AI改动及原项目/结果记录。
