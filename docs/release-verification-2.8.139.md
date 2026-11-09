# 2.8.139 验收记录

2026-11-10，基线431a6e7 / 2.8.138，源码D:/AI/Qwen3-TTS/xingzhou-release。开始时仅有electron-runtime-43.2.0与output两个未跟踪目录，保留未动。

## 实现范围

ProjectVoices默认打开搜索/单选已读取人物的窗口，以原voiceIdentity key保存或打开同一profile，不建立manual副本，不重写association或speakingSceneIds。已有年龄阶段区分沿用，用户不需重新填。短出场人物选择后开启显示、清搜索和状态筛选，并切回全剧定位；手工补录仍走原manual结构及场景关联。所有写入沿用store队列和页面canEdit/loaded/job门禁，不增加生成或模型调用。

头部查看范围在添加按钮左侧，二者靠右，添加按钮采用紫色主操作，默认表单不出现姓名/年龄/场景输入。手动补录才展示该表单；取消不保存。复用Dialog焦点循环、Esc及焦点返回。新增独立复核发现的两处问题已修：权限变只读仍能关闭弹窗，失败原因在弹窗内可见并保留输入重试。

## 音频参考机制解释（未改代码）

core/voiceBinding.js的compileVoiceBinding根据本条实际正常对白决策，附上已采用音频和编排后的@audio编号，再追加【人物正常对白音色参考】。core/promptArtBinding.js的compileEntryBinding以导演源正文编译，不回写导演原提示词。

该追加函数没有对同名块去重。若源正文预先含同名块，可能再追加一块；源中有@audio1等编号时还会先触发现有手工引用核对门禁。因此保持由程序按真实素材追加更稳妥。不能说所有手工编辑必定覆盖或一定无冲突。本次未修改上述两个模块。

## 验证

- 新core/voiceSelection.test.js 4项：原身份/场景复用、重复选择不复制、原音频/候选/association/draft保持、未知/过期/手工身份拒绝、待采用身份及正常对白联动；加原characterVoices与voiceBinding共13项通过。
- qa/voice139-ui.cjs：1280/1700/2232三宽实际ProjectVoices组件，默认选人无人工字段，6个可选身份含短人物及年龄阶段，取消零写入，选择短人物后定位，原候选/采用音频保持，0模型/生成调用；手工补录保存场景关联，重新打开仍默认选人；权限变化Esc、失败反馈/输入保持重试，无pageerror/页面溢出。
- 原voice-review-ui fixture此前仍指向已移除的ReviewSection旧音色tab，初跑超时。更新为直接渲染当前ProjectVoices，保留原模拟数据/API；未用跳过断言掩盖产品问题。
- 旧音色批量/生成/采用/编辑/删除/并发与部分失败回归、全量、构建、安装包与公开发布证据完成后补记。

UI模拟云写/生成，无真实用户工程修改、真实付费或强制覆盖运行客户端。纯客户端，无云端代码/schema部署。
