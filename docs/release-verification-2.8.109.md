# 2.8.109 发布核验

日期：2026-11-02
源码提交：`4e13da8`
安装包：`Xingzhou-Film-Tencent-Setup-2.8.109.exe`
大小：103,952,830 bytes
SHA256：`d0dd0afa0ccb7eedbde5424ac6cc46cf9a860a6bc0251596f1c9c56cc66c7797`

## 功能与自动化边界

- 全自动和半自动共用项目与智能体、剧本与提示词、信息读取、人物音色、美术资产、视频生成、超分与剪辑七项设置。
- 半自动读取已保存成果，从实际缺项接续；提示词下游只核对覆盖、生成状态和素材关联，不重新判断提示词正文、剧情、台词时序或镜头质量。
- 人物、场景、道具及启用时音色关联可补卡、补描述、重新分发；全部人物音色卡自动补全、短样音扩写并生成确认采用的样音。
- 单条提示词所需素材齐备即可提交视频；视频下载后立即逐片调用 Proteus，整集超分凭据齐备后进入剪辑。

## 自动化与界面验证

- `npm test`：2656/2656 通过。
- `npm run build`：Vite 生产构建通过。
- `verify-workflow-28108-ui.cjs`：1280/1700/2232 三宽通过，七步设置、提示词/美术备用模型及持久化通过。
- `verify-production-ui.cjs`：1280/1700/2232 三宽通过。
- `verify-fallback-video-ui.cjs`：1280/1700/2232 三宽通过。
- `verify-voice-review-ui.cjs`：1280/1700/2232/2560 四宽通过。
- `verify-audio-ui.cjs`：1280/1700/2232 三宽通过，音频请求 3 次。

## 安装包运行验收

`qa/packaged-smoke-2.8.109-1793575252912/report.json` 返回 `success: true`。运行时、更新签名、授权门禁、媒体预览、音频预览、文档往返、视频池与超分相关桥接均通过。

## 公开发布核验

- 官方镜像：[Xingzhou-Film-Tencent-Setup-2.8.109.exe](https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.109.exe)
- GitHub Release：[v2.8.109](https://github.com/lt20220610120-png/xingzhou-film-updates/releases/tag/v2.8.109)
- GitHub 安装包：[Xingzhou-Film-Tencent-Setup-2.8.109.exe](https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.109/Xingzhou-Film-Tencent-Setup-2.8.109.exe)

官方 `latest.json`、`xingzhou-film-updates` 与 `xingzhou-film-tencent` 三份清单均返回版本 `2.8.109`、大小 `103952830`、上述 SHA256，并通过 `electron/update-trust.cjs` 的 Ed25519 签名和下载地址校验。

本机安装包：[Xingzhou-Film-Tencent-Setup-2.8.109.exe](D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.109/Xingzhou-Film-Tencent-Setup-2.8.109.exe)
