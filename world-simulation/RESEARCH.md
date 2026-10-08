# 开源核验与取长补短（2026-10-09）

直接检查官方 GitHub 的目录、接口和源码。根据公开文档与部分源文件判断匹配度，不是运行基准测试，没有证据宣称本项目性能优于所有开源项目。

| 来源 | 核验与借鉴 | 在本项目的处理 |
|---|---|---|
| [Concordia](https://github.com/google-deepmind/concordia) | GM裁决、人物行动/记忆、checkpoint | 学习角色局部行动与世界裁决的分工；不把整个Python研究框架作为行舟运行依赖 |
| [StoryBox](https://github.com/amcghm/StoryBox) | MIT；ba24ff64e6023e8d071af4adb7e64b03bd9b08b1，人物自治与故事管理双向驱动 | 作者目标进入世界裁决，人物行动仍只用本人可知数据 |
| [BRING](https://github.com/Eva-E1/BRING) | Apache2；e907dee1b2a52c023210e5e23be95c6f08fa16f1，world_explorer/branch_manager.py | 独立分支、切换、比较；首版不做自动合并冲突 |
| [Rundale](https://github.com/dmooney/rundale) | GPL3；44f705285f07ea15d84414ffb66032a3139fe185，limerick-persistence分支与journal | 自主实现事件日志、事务存储和历史回放，未复制GPL代码 |
| [llm-rpg-world-simulator](https://github.com/subho004/llm-rpg-world-simulator) | 6cdd86221a74eadae29f9593ae35273881dcf77a，app/services/diff_applier.py；未检测到明确许可 | 参考结构化diff与状态校验思路，原创实现字段白名单 |
| [Project Lunar](https://github.com/horizonfps/project-lunar) | 20a284eb91d9f3da5d670cc08b61c7ec11bff067，backend/app/engines/memory_engine.py；未检测到明确许可 | 学习记忆分层与见证过滤思路，角色局部观察/有限证据检索自行实现 |
| [BookWorld](https://github.com/alienet1109/BookWorld) | 参考从小说提取人物/世界及干预场景；长篇建模结果仍需校验 | 不直接把抽取结果变成正史；首版以作者确认起点为准 |

BRING已经有分支管理，原资料中“没有任何开源项目内置分支管理”的绝对说法不成立。Concordia可用作研究原型，但完整序列化世界、蝴蝶效应闭包与行舟适配仍需自己实现。经过取舍，本项目使用独立轻量内核，保持原API模型和项目保存流程，不额外要求用户部署研究服务。

原始GitHub API研究记录与源码核验路径保存在工作区“大世界模拟项目/研究/github-20261009.json”。公开项目以后可能更新，以上判断以当次核验为准。EvoSpark未定位到可确认的官方可用代码，不做已验证底座承诺。
