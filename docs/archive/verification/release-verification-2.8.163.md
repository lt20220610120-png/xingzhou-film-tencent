# 行舟影视 2.8.163 验收

2026-11-14。基于 2.8.162（39175b0），实现 2958f3c。兼容旧关联记录的重复缺项编号，批量确认按当前提示词签名校验并一次保存。过期分发记录不再阻挡人工确认，仍在运行的分发继续保护。核实发布将当前提示词和已关联素材写入分镜。

- 「家庭文」本地检查发现两组重复缺项编号和四个过期分发记录。以内存副本运行实际确认逻辑，265 个待处理项降为 0，当前版可核实提示词 5/102 升为 102/102，第 5 集和 5-1 可核实。真实项目与云端业务数据未写入。
- 自动回归覆盖同版本改稿后重新关联、旧重复编号、只处理所选项、重复提交参数、过期分发和明确核实发布；经过实际分镜合并逻辑，已选参考图和新正文均进入分镜。隔离 Electron 实际点击勾选确认、确认全部、核实并发布本场，发布请求携带现有关联素材。模型与业务云端接口为模拟。
- 全量 3092/3092，Vite 构建、Electron 隔离界面及正式包运行通过。Release 444951106，安装包 104136342 字节。三份公开清单验签、官网 Range、源站 HTTPS 整包、GitHub 资产摘要和软件内更新弹窗续传与安装回调通过。 公网整包连接在当前网络被提前关闭，源站经 HTTPS 读取整包的摘要与本机、GitHub 一致。Actions 43545859034。
- SHA256 `5b9d204444c1a2da1eeb927dfccfed6ab82d697fa25547079f53389989e71355`。
- 官网 https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.163.exe
- GitHub https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.163/Xingzhou-Film-Tencent-Setup-2.8.163.exe
- 本机 D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.163/Xingzhou-Film-Tencent-Setup-2.8.163.exe
