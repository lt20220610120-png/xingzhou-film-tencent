# 2.8.115 发布核验

日期：2026-11-02。

## 界面与行为

- 智能体设置常驻 Codex、Hermes，Cursor、Claude Code、自定义 ACP 默认收进“其他智能体”。选择收纳项时自动展开；主按钮、图标、名称、状态、选中标记和说明按钮使用固定网格对齐。
- 对话消息区高度为 `clamp(460px,52vh,760px)`，窄窗最低 380px。用户消息、Agent 回复、工作日志和工具执行结果使用不同层级，编辑框为独立圆角卡片并自动增高。
- 点击发送立即清空草稿；Enter 发送，Shift + Enter 换行，中文输入法组字期间不误发送。忙碌状态仍阻止重复提交。
- 新工具回执只向对话写中文摘要，完整结构化结果仍返回 Agent。旧任务中以 `工具已执行：xingzhou_task / …；{JSON}` 保存的回执在显示层转为摘要，不展示配置、路径或整段 JSON。
- 长回复里的字面 `\n`、`\t` 转为真实换行和制表；常见模型繁忙、回包过大与 IPC 包装错误转成可读提示。

## 验证

- `npm test`：2680/2680 通过，其中新增工具回执测试确认 Agent 仍收到完整结果，界面消息不含 config、agentPath 或 JSON 括号。
- `npm run build`：通过。
- `node scripts/verify-production-ui.cjs`：1280/1700/2232 三宽通过。检查默认只显示 Codex/Hermes、展开选择其他 Agent、消息区高度、发送等待期间编辑框已为空、旧 JSON 摘要、预检、启动暂停、模型切换、项目与视频池下载、横向溢出。
- `node scripts/verify-agent-catalog-ui.cjs`：1280/1700/2232 三宽通过。检查 Hermes 模型连接、其他智能体展开、Cursor 缺组件状态、安装说明与运行页模型。
- 实际查看 1700 宽设置页与聊天页截图后修正选中行居中偏移，再跑两组三宽验收通过。
- 首次默认 Electron 解压重命名两次被 Windows 拒绝；改用本机同版本 Electron 43.2.0 已解压运行目录打包成功，没有降低 Electron fuses 或修改安全设置。
- 安装包运行烟测 `qa/packaged-smoke-2.8.115-1793628300159`：`success=true`、`errors=[]`，页面显示当前版本 2.8.115。
- 未执行付费生成，未安装替换当前客户端，未修改用户项目资料。

安装包：103965898 字节。

SHA256：`680684a5b6e841e7323223c13fd18497bd41a6880feee31fe01146ce70477410`。

本机文件：`D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.115/Xingzhou-Film-Tencent-Setup-2.8.115.exe`。

## 公开发布

- 实现提交：`95b9baf`；源码已合并推送 main，公开清单提交：`6052702`。
- GitHub 正式 Release 与安装包已发布；官网镜像：`https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.115.exe`。
- 两个 GitHub 仓库 main 的 `latest.json` 均实际读取为 2.8.115，安装包地址、103965898 字节、SHA256 与 Ed25519 签名一致。
- GitHub 公开安装包已完整下载复核，大小与 SHA256 均和本地安装包一致；发布脚本同时返回官网镜像大小与哈希核验通过。
