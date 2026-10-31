# 2.8.101 验收（2026-11-01）

- 全量测试：2609/2609；Vite 构建通过。
- 音色审核 UI：1280、1700、2232 三宽通过；单列卡片、身份依据传入、音色描述选填、搜索/筛选、人工新增、导出、批量生成/采用通过。
- 自动化：制作阶段顺序为剧本与提示词 → 人物音色 → 美术清单与关联 → 美术图片；开工设置三项音色模型；第一条成功生成语音自动采用；Agent 系统指令包含年龄阶段、实际讲话人物和第一条采用规则。
- 年龄阶段和正常对白测试覆盖；旁白/画外音/心声不进入音色。
- 本轮仍使用模拟生成接口验证，没有进行真实收费视频生成。


安装包发布：
- NSIS运行时验收 PASS；安装包 103934851 字节。
- SHA256：1e92d6a855656f54827d4a16887f960b7f8aaaa4d54196c69b05a557062971c8。
- 本机安装版本：D:/行舟影视客户端/Xingzhou Film Tencent Edition/Xingzhou Film Tencent Edition.exe，2.8.101.0。
- 官方安装包：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.101.exe
- GitHub 安装包：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.101/Xingzhou-Film-Tencent-Setup-2.8.101.exe
- 本地安装包：D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.101/Xingzhou-Film-Tencent-Setup-2.8.101.exe
- 官网与两个 GitHub latest.json 均为 2.8.101、103934851 字节、上述 SHA256，签名清单发布通过。
