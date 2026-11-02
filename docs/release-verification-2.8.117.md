# 2.8.117 验收（2026-11-02）

基线f893b24。用户反馈2.8.116聊天仍为泛化工具摘要，8MB协议接收上限中断。
OpenFilm只读参考：本机src/agents.mjs通过session/update分别转发message/tool/plan等事件，chat-store.mjs按turn+items记录；行舟继续使用已接通的App Server，复用同一会话，按provider itemId区分过程/最终消息，执行步骤折叠并可展开参数和回执。
新增按帧JSON-lines读取器；合法合并消息超8MB、UTF8逐字节拆分、超大可选raw通知前缀分块后仍能收到完成事件均通过。初始化optOut rawResponseItem/completed，不忽略工具请求与完成回执。异常协议仍明确报错并关闭子进程。
工具读取支持offset/limit及path/textOffset，响应有total/nextOffset/路径提示。原数据不变，媒体引用代替base64；分页明确标记可继续读取。
真实本机gpt-6.1-sol只读工具验证：模拟源数据42,020,591字节，最后一页3380字节、描述末尾3096字节；24次增量，最终回复“分页验证成功”。不涉及视频付费或用户项目修改。
独立复核已修复读取器跨分块前缀识别、标量路径返回和异常子进程清理。
最终测试、UI、包哈希和公开清单结果另追加。未安装替换当前用户客户端。
