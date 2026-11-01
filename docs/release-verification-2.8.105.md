# 行舟影视 2.8.105 验收（2026-11-01）

## 行为与验证

- 音色页全部操作合并为同一水平工具栏，包含停止按钮。1280/1700/2232/2560 浏览器验证通过，宽屏完整同排、窄屏仅工具栏内部横滚，无页面溢出。使用真实长度的中文模型名称检查；卡片内模型、语言、生成与上传保持基线对齐。
- 标题统计去重的出场≥3集人物与年龄音色卡片；群像排除、短出场与手动卡片单列统计。全部、未生成、未采用实时计数不随搜索改变；显示当前搜索卡片数。实际生成/采用后计数联动通过。
- 手工批量并发默认3，按账号/项目保存、无max限制，正整数校验；6并发输入实测4张就绪卡同时调用。停止不保存取消结果。自动化音色开关与运行期设置回归通过。
- 补全单集校验失败自动修正重试一次，仍失败时保存错误并继续后续分集，最后统一显示问题，不冒充全部成功。60集第24集出错后第60集仍保存；下次只处理失败集。取消不重试、不写失败；缺失单集清单也不阻断后续。
- 语音草稿空白不遮住已读取台词；已有连续逐字正常对白依据直接提取原话，非空人工编辑保留，音色描述不自动补写。统一排除画外声/电话画外声、心声及VO/OS包括点号写法。
- 2625/2625 全量测试通过；Vite生产构建通过；安装包运行时验证 PASS，报告 qa/packaged-smoke-2.8.105-1793513475123。构建日志 output/release-2.8.105-build.log。
- UI原始证据 output/voice-ui-105.log、output/optional-ui-105.log 与 output/playwright/voice-review-{toolbar,busy}-*.png。全部生图/视频/云端模型采用模拟接口，未做收费整剧生产。
- 独立复核发现的画外声误收及取消队首导致长文超批量两项P2已修复，二次复核无剩余P1/P2。

## 本机 Qwen 服务（已部署）

- 单份模型的真实列表批量推理；短对白最大6，>80字符自动最多3，等候最多24，满载429。OOM降批重试，取消未开始请求，安全退出保留活动推理完成。
- 备份 D:/AI/Qwen3-TTS/backups/2026-11-01-dynamic-batching；实际服务与 tools/local-qwen-tts/server.py、batch_scheduler.py 哈希一致。健康 ready=true，最近实际成功批量6，无OOM。
- 12项Python测试与HTTP映射测试通过。短3/6、中英长3及探测长6、活动推理停止/等待请求503/端口关闭实机通过。短6最终复核6/6成功、墙钟6.625秒；长3实测3/3、31.485秒。长6探测虽成功但接近8GB上限，最终默认自动降为3，不能宣称所有长度稳定6路。
- 原始 JSON/WAV/哈希/显存、生命周期记录位于 output/local-qwen-concurrency-2026-11-01，具体见 docs/local-qwen-concurrency-2026-11-01.md。WAV有限非静音24kHz已验；没有ASR或人工听感逐字核验。

## 安装包

- 大小：103940818 字节。
- SHA256：982c514ccc4d3e67ab65eb8da369f40e4f9336375a89469be12b385854457bac。
- 官网：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.105.exe
- GitHub：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.105/Xingzhou-Film-Tencent-Setup-2.8.105.exe
- 本机：D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.105/Xingzhou-Film-Tencent-Setup-2.8.105.exe
- 公开清单及本机安装：发布后补充实测结果。
