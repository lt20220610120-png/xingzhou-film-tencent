# 2.8.161 验收

日期为 2026-11-13。基于 2.8.160（aa909a3），实现 88fd851。修复全剧时长校准遗漏导致分集完成误判，联动与制作使用当前有效批次。云端管理列出独立文档及关联协作项目，核验后可处理本机旧记录。自动化沿原协作项目和原整本任务接续，复用已完成成果。

- 对本机截图项目只读回放。第 4、6–13 集判定恢复完成，第 5 集仍为 2/3。
- 腾讯云只读检查表明，截图中的多个项目在当前库属于协作项目，当前库查到的截图独立导演源为【TK】项目。另有本机旧云端引用，线上数据无写入。云端管理验证通过后允许由用户移回工作台或放入本机回收站，保留服务器所有者和协作恢复期限制。
- 全量 3089/3089，正式构建、包运行通过。隔离 Electron 验证分集变色、旧记录移回、本人协作删除、非所有者禁用。制作控制台三宽浏览器回归通过。
- 用生产适配器回归旧整本任务、现有协作关联、原片提交与归档、超分和剪辑。媒体与模型请求为模拟，真实付费渠道和真实成片未验收。涉及 Topaz/OpenFilm 的独立配置和帐号仍由实际运行环境提供。
- Release 444351850，Actions 43446454840。安装包 104118453 字节，SHA256 1ff1d331855b738e380c5cf8b25a3c8ae7b67c20d8b30c8e82c643e15686dc66。官网 HTTPS 整包校验、公开 Range、GitHub 资产以及隔离更新弹窗 2.8.154→2.8.161 续传、校验及安装回调通过。
- 官网 https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.161.exe
- GitHub https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.161/Xingzhou-Film-Tencent-Setup-2.8.161.exe
- 本机 D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.161/Xingzhou-Film-Tencent-Setup-2.8.161.exe
