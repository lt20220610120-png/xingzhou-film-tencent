# 2.8.42 验收记录

日期：2026-10-17。基线 bc97943（2.8.41），分支 codex/storyboard-reference-ui-2.8.42。原有未跟踪 docs/security-rating-2.8.4.md 和 output/ 保留，不修改用户项目原稿、导入文件或云端媒体。

## 原因与修复

- 云端 collab_media 同时存储普通上传媒体及美术资产图片。cloud-backend/src/media.cjs 的 media-list 按项目 ID 返回记录，其中包含 kind=asset-image；并非按名称读取独立图视生成的整本项目。
- projectReferenceCandidates 原先只检查集数/场景，没有筛选可引用类型，所以资产图片既从美术资产列表以 image 引用，又从原始媒体列表以 asset-image 重复混入。原始资产行没有场景信息，数量可能超出当前场景。
- GenerationComposer 预览原先对所有非 image/video 类型回退到 audio，故出现 @asset-image 编号的假音频播放器。并没有因此生成或上传这些音色。
- 候选与协作媒体入口限定 image/audio/video 并检查项目 ID；内部 asset-image 由原有美术资产链路提供正确场景图片。旧云端分镜及本地草稿在加载时清理错误引用，保留有效参考、文字、参数与 CAS base，必要时显示待保存。保存/提交均不会带回错误引用，不删除原始媒体和云记录。
- 未知类型预览使用明确占位，不再冒充音频。正常、明确上传到项目/场景的音频仍可使用；不按项目名称合并图视生成与项目协作。
- 逐集删除是独立的右上角28px垃圾桶按钮，有 title/aria-label、键盘焦点与悬停反馈；顶部全删缩短文案，完整可访问名称与确认范围不变。
- 分镜启用独立参考滚动区，宽屏按右侧参考上传行的自然位置测量底部，短参数模型保留至少170px，窄窗260px。RO/MO监听尺寸和模型结构变化并完整清理，不以自动margin反向反馈高度；整本生成不启用此布局。

## 验证

- 新增 core/storyboardReferences.test.js：先复现混入重复 asset-image/非媒体/其他项目行，再修复通过。参考相关23项测试通过，覆盖旧稿清理、真实音频保留、别名重排、输入不变及幂等。
- npm test：2172/2172 通过，0失败，日志 output/tests-2842.log。npm run build 通过。
- scripts/verify-history-assets-ui.cjs：真实React隔离页，28px图标、卡片小于150px、取消/确认/保存/重载、全删/详情/导出及其他项目保留通过；资产工具栏1120–2048px既有对齐保持。
- scripts/verify-storyboard-references-ui.cjs：真实React隔离页，48张正常图片与48条错误内部记录模拟旧云分镜和未保存本地稿；清理后无假音频且文字保留，模拟保存/提交仅含48张 image。
- 2048/1600/1280px参考区内部滚动、无横向溢出，底部对齐误差小于0.5px；1120px为260px内部滚动；普通短参数模型170px、底部658.8125与659px。截图与量化报告位于 output/playwright/storyboard-2.8.42/。
- 同名独立整本含20个真实导入音频：协作中不出现这些音频，独立整本页仍保留20个，且不套用协作滚动布局。另一协作场景仅其明确上传的1个音频保留。无真实生成/删除/云部署。
- 独立只读复核通过；补充复核短参数测量和RO/MO清理，未发现阻断问题。
- UI使用生产构建静态页验证：npm run build 后启动 python -m http.server 5802 --bind 127.0.0.1 --directory dist；设置 XZ_QA_URL=http://127.0.0.1:5802/ 和 XZ_PLAYWRIGHT_MODULE 到可用模块，再执行两份脚本。

## 发布

- 版本2.8.42，功能提交b870d69；NSIS安装包制作及运行时冒烟检查通过：qa/packaged-smoke-2.8.42-1792185430790/report.json。
- 正式非草稿Release、两个仓库main/latest.json及官方备用源已发布。安装包103617580字节，SHA256：2eb657a4ece616e1fe006bd0fa7e1535b854b3416e56a21be49c6914d0a38e49。
- 公开下载：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.42/Xingzhou-Film-Tencent-Setup-2.8.42.exe 。本机安装包release/2.8.42/Xingzhou-Film-Tencent-Setup-2.8.42.exe。
- 完整公开下载103617580字节；SHA256与本机、签名清单及GitHub asset digest一致，两份main清单相同。证据output/release-2842-public.json。
- 正式客户端更新模块验证Ed25519签名和当前本地清单一致；2.8.40/2.8.41发现2.8.42，2.8.42显示已最新。优先官方IP源Range请求206、65536字节、MZ头与总大小通过。证据output/storyboard2842-inapp-update-verification.json。
- 验证限制：本机Node直连域名备用源时TLS握手中断，未将该单独探测记为通过；正式客户端使用的优先官方IP源完整验证通过。公开GitHub整包完整下载通过。
- 本次不关闭或替换用户正在使用的软件，不修改真实项目、音频或素材；可在软件内检查更新并安装。
