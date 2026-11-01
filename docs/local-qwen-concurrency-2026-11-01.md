# 本机 Qwen3-TTS 并发检查

范围：用户 D:/AI/Qwen3-TTS 部署的官方 Qwen3-TTS-12Hz-1.7B-VoiceDesign，服务地址 http://127.0.0.1:7891/v1，2026-11-01。

硬件：NVIDIA GeForce RTX 5060 Laptop GPU，8151 MiB显存；检查时占用5951 MiB。此数值是当时状态。

当前服务 server.py 使用非阻塞 threading.Lock。同一进程同时执行一次 generate_voice_design；额外请求明确返回 HTTP 409，未排队，不隐式并行。

实际同时发送两个相同短文本请求：

|请求|结果|耗时|说明|
|---|---|---|---|
|1|HTTP409|0.110秒|Model is busy generating another clip|
|2|HTTP200|6.047秒|130604字节，RIFF/WAV|

当前这套服务的可用生成并发上限是1，建议设置1。此结论不是显卡理论承载上限，也不是对Qwen批处理或其他服务框架的性能上限断言；未更改用户模型服务以解除推理锁，未做显存极限压测。

行舟影视并发控件无固定型号上限，只要求正整数。使用其他本地部署/云模型时可以填写更高并发。当前本地服务若填写大于1，额外请求会按服务行为返回忙碌；软件保留单卡错误并继续其他工作，不伪称生成成功。

原始记录：output/qwen-concurrency-verification.json；探测音频仅写入开发工作区output目录，不混入用户人物音色卡或语音生成结果。
