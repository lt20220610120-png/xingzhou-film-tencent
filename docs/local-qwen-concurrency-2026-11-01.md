# 本机 Qwen3-TTS 真实批量推理验收（2026-11-01）

本机 RTX 5060 Laptop GPU 8GB，官方 `Qwen3-TTS-12Hz-1.7B-VoiceDesign`，单模型常驻、bfloat16、PyTorch SDPA。服务在 `D:/AI/Qwen3-TTS`，镜像源码在 `tools/local-qwen-tts`。修改前服务和启停脚本已备份到 `D:/AI/Qwen3-TTS/backups/2026-11-01-dynamic-batching`，未修改权重或安装其他推理框架。

此前每个请求争抢 `threading.Lock`，忙时直接返回 409。本次用一个 GPU 工作线程管理模型，收到并发请求后在最长 120ms 窗口中组成真正的输入批次：`generate_voice_design(text=[...], language=[...], instruct=[...])` 只调用一次，为每条请求按同一索引返回一个 WAV。一个批次内的多条文本共同参与模型批量运算；批次之间仍顺序执行，避免多个线程同时修改同一自回归模型状态。官方 [VoiceDesign 批量示例](https://github.com/QwenLM/Qwen3-TTS/blob/main/examples/test_model_12hz_voice_design.py) 和 [推理 API 源码](https://github.com/QwenLM/Qwen3-TTS/blob/main/qwen_tts/inference/qwen3_tts_model.py) 均支持这三个列表输入；本机安装源码也已核验。

短对白最大真实批量为 6。任一候选文本超过 80 个字符时真实批量最多 3，以给 8GB 卡保留余量。6 条长文本会分为两批，每批 3 条同时推理。`QWEN_TTS_MAX_BATCH_SIZE` 可把启动上限设为 1–6。该字符阈值是本机经验保护，不能精确预测最终语音时长或保证所有极限输入都无需进一步降批量。

## 实机证据

原始 JSON、每条请求的文本、语言、耗时、HTTP 状态、WAV 路径、采样率、帧数、峰值、RMS 和 SHA256 均在 `output/local-qwen-concurrency-2026-11-01/`。短文本结果是最终服务代码重新启动后的实测；生成使用模型默认采样，因此时长会随采样改变。

| 工作负载 | 真正模型批量 | HTTP 成功 | 整批墙钟秒 | GPU 推理秒 | PyTorch 峰值 allocated / reserved MiB |
|---|---:|---:|---:|---:|---:|
| 中英文短对白 3 请求 | 3 | 3/3 | 5.750 | 5.609 | 4249.5 / 4374.0 |
| 中英文短对白 6 请求 | 6 | 6/6 | 4.937 | 4.922 | 4476.5 / 4842.0 |
| 中英文长对白 3 请求（最终保护与缓存清理启用） | 3 | 3/3 | 31.485 | 31.421 | 5521.4 / 6766.0 |
| 关闭长文保护时探测 6 条长对白 | 6 | 6/6 | 50.375 | 50.328 | 7190.0 / 9876.0 |

长文 6 条探测生成 11.2–18.08 秒音频，虽全部成功，但峰值 reserved 超过物理显存容量（Windows 可使用共享 GPU 内存），探测后 `nvidia-smi` 显示 7698/8151 MiB 已用、仅 113 MiB 余量。因此最终默认长文使用真正批量 3，且每批成功后清理未使用缓存。不能把这个探测结果解释为任何长度下都能稳定批量 6。JSON 中 `peak_reserved_mib` 是 PyTorch 分配器计数，不能解释成显卡总物理显存使用量。

所有基准 WAV 均可读取为 24kHz PCM16、有限非零波形且各请求 SHA256 不同。本文没有声称完成 ASR 文本逐字一致性核验或人工听感评估；请求与输出的索引、音色描述、语言映射由独立 HTTP 并发测试验证，音色品质仍受 VoiceDesign 模型影响。

## 取消、满载、异常和停止

另有最多 24 条等待请求，满载返回 429 与 `Retry-After: 2`，不无限占用内存。客户端断开或任务取消时，尚未开始的请求取消且不进入模型；已开始的批次允许推理完成，以保持 CUDA 和模型状态完整。输出数量不匹配会对该批明确失败，不把其他条目的音频错配过来。

遇到 CUDA OOM 后，先退出异常作用域以释放 traceback 引用，再清理显存缓存，把该批分为较小真实批量并重试每条原请求；同时降低后续有效上限。单条仍然 OOM 则明确返回 503，不静默丢弃或自动调用云端。

`Stop-Qwen3TTS.ps1` 先核验 PID、解释器路径及服务脚本，再请求仅本机可达的 `/internal/shutdown`。已进入 GPU 的批次完成后退出；未开始请求收到 503。超过 30 秒则提示还在结束活动推理，不强杀进程。模型由 lifespan 等待工作线程退出后释放。启动保留单例互斥、端口占用检查、离线环境变量、CUDA 检查、模型身份与健康等待。

## 应用可读健康状态

`GET http://127.0.0.1:7891/health` 保留 `ready/model/device/model_path`，新增：

- `concurrency.mode = dynamic_batch`，`max_batch_size = 6`，`effective_max_batch_size` 随 OOM 下调。
- `recommended_client_concurrency` 建议短对白请求并发数，`pending` 是等待数，`active` 是当前真正批量条数。
- `last_batch_size/largest_successful_batch/completed/oom_retries/closing` 表示实际执行状态。
- `long_text_policy = {threshold_characters: 80, max_batch_size: 3}` 表示长文保护。
- `last_inference = {batch_size, seconds, peak_allocated_mib, peak_reserved_mib}` 是最近一次真正模型调用。

推荐客户端默认 6 个短对白同时提交；长段落可设 3，也可由服务自动分批。健康检查不等待 GPU，因此推理时仍能读取活动批量数。

## 重复验证

```powershell
& D:/AI/Qwen3-TTS/.venv/Scripts/python.exe -m unittest discover -s tools/local-qwen-tts -p 'test_*.py'
& D:/AI/Qwen3-TTS/.venv/Scripts/python.exe tools/local-qwen-tts/benchmark_concurrency.py
& D:/AI/Qwen3-TTS/.venv/Scripts/python.exe tools/local-qwen-tts/benchmark_concurrency.py --long --counts 3
```

单元和 HTTP 路由测试覆盖真实批量组成、各请求映射、长文保护、排队取消、等待上限、停止、模拟 OOM 拆批和结果数量错误。测试只替代 GPU 生成边界，不替代调度器和实际 HTTP 路由。`verify_service_lifecycle.py` 是对本机运行服务的断开连接/活动批次/等待请求/关闭端口验证，运行后服务停止，需要再次启动。

最终本地测试 12 项全部通过。实机 `lifecycle.json` 也验证通过：断开连接的等待请求从 pending 1 降为 0 且未生成；停止时另一个等待请求明确 503，已经开始的 GPU 请求完成并返回 200、13.84 秒有效 WAV，随后端口关闭。日志记录应用正常 shutdown complete；`after-graceful-stop-gpu.csv` 记录停止后物理显存仅用 387 MiB，剩余 7424 MiB。验证后重新启动本机服务并保留可用状态。已将该次完整服务日志保存为 `verified-server.log`，以免重启覆盖证据。

独立复核发现已取消的队首条目可能遮住后面的长文本，使长文批量上限失效；现改为从前 N 条仍有效请求计算上限，并在组批时逐项复核实际输入，涵盖计算上限后发生取消的竞态。新增三项确定性回归覆盖取消队首、组批中取消、取消与 OOM 拆批同时发生。修复后核验服务空闲、镜像实际源码并安全重启，另存 `post-review/batch6.json`：6 条真实批量全部 200，墙钟 6.625 秒、推理 6.562 秒，峰值 allocated 4575.3 / reserved 5042 MiB；`post-review/final-health.json` 显示 ready、活动与等待数均为 0，最大成功批量为 6。
