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
- 旧音色批量/生成/采用/编辑/删除/并发与部分失败回归在1280/1700/2232/2560四宽全部通过。旧脚本仍等待已移除的批量生成状态文字、旧采用提示及“停止丢弃运行中回包”的旧行为，分别改查实际回执、当前采用提示和保留运行中结果；未改产品队列逻辑。
- 全量npm test两轮均2866/2866通过；最终构建通过，既有bundle体积提示保留。独立复核两项P2已闭合，无剩余实质问题。
- 最终截图发现共享form-dialog全宽输入/块级label覆盖单选项；已用局部样式隔离，增加单选宽度与行高实测断言，三宽复验通过。截图output/playwright/voice139-picker-1700.png。
- 首次打包下载运行时后临时目录rename报EPERM；改用本机既有同版本Electron43.2.0分发重打，不改源码绕过检查。样式修正后再次构建打包、NSIS运行及本地媒体/权限/桥接等完整检查通过，最终报告qa/packaged-smoke-2.8.139-1794252180136。
- 最终安装包104056648字节，SHA256 424cb7e1307f5c2c510cd9ca71b4d23fd708460118d03e8f5dc933a9652396e3。初轮尚在上传时暂停发布以修正样式，旧包不用于最终清单。

UI模拟云写/生成，无真实用户工程修改、真实付费或强制覆盖运行客户端。纯客户端，无云端代码/schema部署。

## 公开发布与收尾核验（2026-11-10）

接手续查发现最终上传已完成，原未提交项是上述最终验收补记；本轮未重复替换线上安装包。output/voice139-publish-direct-upload.log记录最终GitHub上传、官网镜像安装和两仓latest.json发布全部完成，Release ID 439536337。官网镜像安装脚本已验证整包大小与SHA256。

- 本轮重新计算本机最终安装包SHA256，结果424cb7e1307f5c2c510cd9ca71b4d23fd708460118d03e8f5dc933a9652396e3，大小104056648字节。
- 官网及GitHub更新仓/源码仓三份公开latest.json均与本地最终签名清单逐项相同，Ed25519签名验证通过；GitHub最终资产state=uploaded，size与digest一致。证据output/voice139-public-verification.json。
- 官网公开Range返回206、Content-Range总大小正确，前65536字节与本机最终包一致。另通过既有SSH密钥与固定主机信任只读重新计算官网/opt/xingzhou-updates最终文件完整SHA256及stat大小，均与本机最终包一致；证据output/voice139-official-server-hash.json。官网域名整包下载曾读超时，因此本次整包哈希证据来自服务器实际文件，不将下载超时计为通过。
- 使用生产fetchUpdateManifest/createUpdateFetch实际检查更新，命中https://106.55.41.128/api/updates/latest.json，读取2.8.139并确认高于2.8.138，清单签名与传输证书通过。证据output/voice139-in-app-update.json。
- 实现及最终样式修正e4fe0d5已核对远端codex/character-voice-workflow同一提交。补齐本验收记录、开发交接手册及工作区软件更新记忆。

官方安装包：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.139.exe

GitHub安装包：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.139/Xingzhou-Film-Tencent-Setup-2.8.139.exe

本机安装包：D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.139/Xingzhou-Film-Tencent-Setup-2.8.139.exe
