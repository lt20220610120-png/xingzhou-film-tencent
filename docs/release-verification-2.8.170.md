# 2.8.170 验收（2026-11-15）

## 原因与修复

基线c99bfce、公开169。用户截图为原图已取回但项目云端保存失败。168统一API传输后，collab-service上传仍传Content-Length；真实Electron net.fetch在本机HTTP服务上立即返回net::ERR_INVALID_ARGUMENT，服务器没有收到上传。与整体网络是否连通无关。旧isMediaNetworkError以net::ERR_统称网络问题，掩盖了参数错误。

desktop-api-transport保留显式鉴权和Content-Type，让Chromium按body计算长度；手动跳转GET仍保留既有适配。无效参数不当作网络错误重试；云上传保留脱敏后的具体错误。图片原文件、待恢复任务与已有定稿不清理，无重新付费生图。

视频后台GenerationMonitor原先每个success自动调用collabRecordGeneratedMedia。现取消视频自动上传；任务管理器对普通公开视频结果直接保存URL完成，FT、自定义协议、Fnko、Like、LibTV入口使用同一判定。需要本地文件的workflowRunId/storyboardBatchRunId/autoDownload任务仍走下载。无公开结果地址、原站受保护content入口保留既有下载能力。

GenerationResults新增上传到云端，主进程从当前账号的已完成任务取真实文件或URL，不相信调用者提供的文件位置；核对项目/角色/锁，按账号与任务合并并发，下载后记本地路径，再上传和记录。回执丢失按generation marker核对，保留本地文件重试。已完成云端记录不再上传。本机项目通过既有邀请协作流程分享后再上传视频；按钮不隐式转换项目存储。

## 验证

- scripts/verify-desktop-upload.cjs真实Electron复现旧ERR_INVALID_ARGUMENT，再用修复后的传输验证两种大小写长度头，2次PUT字节及鉴权一致。未调用付费生成。
- 新回归验证普通链接0次视频GET、重启保存URL、明确自动化下载、上传失败保留本地、回执丢失核对及项目权限/锁。
- 既有下载测试显式选择autoDownload，继续覆盖下载失败恢复、原任务查询、跨站密钥保护和自动化文件回收。
- 实际GenerationResults双宽1280/1920：窗口直接播放本地HTTP测试视频，预览0次上传、点击上传1次、下载0次，成功刷新1次；生成和上传接口为模拟。
- 初次全量因原cloud-backend/node_modules指向外层且缺yjs ESM文件失败；替换成本工作区物理安装依赖后，补齐Windows sharp运行文件。未修改依赖声明或升级版本。失败轮不作为通过证据。

最终全量3115/3115，0失败；Vite构建通过（既有大chunk提示）。正式NSIS运行PASS，qa/packaged-smoke-2.8.170-1794751600638。6份关键ASAR模块与源码逐字节一致。纯客户端，无生产云业务/schema部署，无真实项目内容改写。

## 发布与交接

- 实现0ffff07已推送codex/character-voice-workflow；Release446105210，上传workflow43722729981成功。
- 安装包104142968字节；SHA256 `cbca4c2e959270409b9194282b11fefa97039a79398a7694c359bc7d70bc98ca`。
- 本机、官网服务器完整SHA256与GitHub资产digest一致；三份公开更新清单内容一致且Ed25519验签通过。官网Range206首64KiB与本机一致；客户端固定证书IP源可读170。
- 实际隔离更新弹窗154→170续传最后64KiB、整包校验和安装回调通过；安装为测试替身，未安装或重启用户客户端。
- 官网 https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.170.exe
- 本机 D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.170/Xingzhou-Film-Tencent-Setup-2.8.170.exe
- 恢复截图中的图片时点击继续保存图片，沿用原图和原任务；本轮没有实际重试写入用户工程，不声称已将那一张上传成功。
- 外部视频链接的有效期由服务商决定，长期保留可下载本地或明确上传协作副本；预览仍需读取媒体字节，但不会自动保存到项目云存储。
- 通用传输今后改动必须保留scripts/verify-desktop-upload.cjs的真实Electron测试；普通fetch模拟无法复现Chromium framing限制。

证据：output/170-tests-pass.log、170-build.log、170-upload-runtime.json、170-sharing-tests.log、170-ui.json、170-ui-1280.png、170-ui-1920.png、170-package.log、170-artifact.json、170-stage.log、170-publish-final.log、170-public.json、170-update-ui.json。
