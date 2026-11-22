# 2.8.26 发布验收

- 源码提交：`d375b4d`，视频自主接入与任务恢复；独立只读复核通过。
- 冻结源码 `npm run dist`：全量测试 1974 通过、0 失败；生产构建和 NSIS 打包通过。
- 实际 Electron 安装包运行：PASS，视频配置模块与未来型号目录检查通过，既有工作区、桥接、导入和本地素材检查通过。
- 真实 App 界面模拟：刷新未内置飞拓型号 → 手工覆盖时长20秒/图片上限3 → 保存 → 图视生成选择新型号 → 提交；另一个上游的 Videos JSON 配置 → 选择 → 提交。页面异常为0。付费调用为0。
- GitHub Release：v2.8.26，正式发布；两仓库 main 清单通过 Contents API 与对应提交原始文件交叉核验一致。发布后 main 原始URL CDN曾返回旧缓存，官方备用源已同步。
- 公开安装包完整下载：103578511 字节，SHA256 `d5cba1eb7cfadb7aac2eb11e3d0f972642704a27688c6dd8ce1f76c61ccfe24d`，与本机和 GitHub asset digest 一致；Ed25519 清单签名通过。
- 官方备用源：发布脚本在服务端核验完整安装包大小/哈希，客户端固定证书下载器核验清单签名与 65536 字节 Range 请求。此次未重复完整备用源断点续传测试（前版已覆盖）。

安装包：[GitHub公开下载](https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.26/Xingzhou-Film-Tencent-Setup-2.8.26.exe)。

能力边界和操作方式见 [视频自主接入说明](video-self-service-2.8.26.md)。没有执行生产视频生成，不能据模拟验收承诺所有账号/协议的上游可用性。
