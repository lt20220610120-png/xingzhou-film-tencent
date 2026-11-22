# 2.8.113 发布核验

日期：2026-11-02。源码：b55b57f。

## 语义修正

删除readExecutionDirective的单集特例及旧聊天自动转scope；删除独立固定范围条。默认流程是身份与经验，当前用户指令优先；临时安排仅存当前任务，不写入全局预设。新指令由Agent动态理解并实际调用工具，支持任意集数组和解除安排；明确保存默认经验时才修改默认规则。旧版无消息来源的自动范围清除并暂停，保留任务成果。

## 真实后台工具

production-agent在thread/start注入dynamicTools、处理item/tool/call并返回实际结果；production-tool-bridge经main/preload/hook连接controller.agentTool。回执核对发送窗口和run，后端项目工具绑定当前项目，原任务查询使用本机原配置，非由Agent传密钥。

xingzhou_task：inspect、set_scope、clear_scope、pause、continue、update_settings、run_stage。
xingzhou_project：project、assets、bindings、generations、refresh、archive、post_status。

当前开放制作工作流所需工具，不把任意IPC或其他项目接口直接开放。按用户最新要求调用，真实工具失败不冒充完成；异步工序返回accepted，后续应读取状态核实。暂停可以单独归档，done任务新安排可以重开；clear_scope重开浅层后期以接续默认终点。

协议依据：[Codex官方App Server工具协议](https://learn.chatgpt.com/docs/app-server)，并核对本机generate-json-schema输出。

## 验证

npm test：2675/2675；生产构建通过。三宽UI1280/1700/2232通过。
真实本机Codex一次只读fixture工具调用成功：realCodexTransport=true、toolCalls=1、paidActions=0、reply=OK。该探针验证动态工具协议往返，不等于真实付费整集成片验收。
回归覆盖：临时前两集改前三集；历史聊天不转默认；新任务不继承临时安排；工具真实应用及解除；done任务按新安排实际接续；未授权聊天工具拒绝；窗口/run回执身份校验；注入工具与Codex调用/回包。
独立复核发现的暂停不能归档、done任务不能重开及解除浅层终点问题均已修复。

最终安装包qa/packaged-smoke-2.8.113-1793623508232：success=true、errors=[]。
安装包103961720字节，SHA256 51620aac70b9468eff50ce0d4bf668932428f96d591c55e128e952092a40907d。

- [官方安装包](https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.113.exe)
- [本机安装包](D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.113/Xingzhou-Film-Tencent-Setup-2.8.113.exe)

本机尚未安装替换当前客户端；未新提交真实付费视频。

官方镜像与两GitHub仓库main清单版本、大小、哈希和Ed25519签名核验全部通过。
