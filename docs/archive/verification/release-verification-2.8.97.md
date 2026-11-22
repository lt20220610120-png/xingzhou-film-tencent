# 2.8.97 发布验收 · 2026-10-31

## 本次交付

- 视频失败策略仅在开工设置 → 视频生成配置，主模型次数 + 可增删/排序的备用1、2、3…列表，每项独立次数。开始制作冻结配置快照，明确上游失败后自动按序接力，无需人工暂停介入。
- 兼容2.8.96单备用配置；空/失效/不兼容备用模型开工前拦截。重复模型在不同位置的次数累计，重启/接续保留历史失败，未知提交、查询和下载故障不触发重复付费。
- 运行页移除重复策略表单。新任务草稿普通切页保留；开工设置可显式选择既有任务调整未来策略，既有主参数与成果保留。
- 移除视频池副说明和清单核实大字口号。
- Codex制作检查、修复、对话、剪辑统一使用ephemeral:true临时会话并要求服务端确认；windowsHide、stdio、shell:false与审批/沙箱不变。不会回退为持久化聊天，旧聊天不删除。

## 验证

- 源码 `1182f3b`，发布副本是该提交的干净 detached worktree；不包含其它聊天并行进行的本地音色开发。
- 干净发布副本 `npm test`：2572/2572；`npm run build`：通过（既有大chunk体积提示仍在）。初次环境缺少cloud-backend依赖的链接，补齐既有依赖后完整重跑通过；未改业务代码解决环境问题。
- 三宽1280/1700/2232 Playwright：添加多备用、独立次数、上移下移删除、新任务快照、运行页无设置、原任务保存不新建、切页草稿保留、视频池即时显示及下载范围通过。`output/playwright/furnace-2897-ui.json`。
- 无人值守模拟：primary3→b1→c2→d1→e成功；全过程run仍running，无暂停/用户输入；重复模型累计与总次数耗尽不超量、旧配置、删除列表、持久化深拷贝及未知任务保护通过。
- 独立只读复核38项通过；发现并修复切页丢草稿P2，复核者独立三宽复验关闭，控制器15项通过。
- 本机Codex真实只读协议探针：ephemeral:true、thread/list不含临时会话、0次turn/start、0次模型生成；`output/agent-ephemeral-2897.json`。模拟传输3项覆盖模型回包与不支持临时会话时不发送剧本。
- NSIS和实际安装包运行验证通过，`qa/packaged-smoke-2.8.97-1793422784002`。
- 已发布，安装包103914167字节，SHA256 `a33b6c81119aed867eb03f27e4c0728712921ed1a1d7bb9a48b61213320527bb`。
- 官网及两个GitHub仓库三份latest.json签名、版本、大小、hash、installerUrl一致；官网Range206及MZ头已验证。首次GitHub清单PUT遇连接中断，按同一已签名清单核对补齐后全部通过，未重传/替换已验收包。
- 官网：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.97.exe
- GitHub：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.97/Xingzhou-Film-Tencent-Setup-2.8.97.exe

## 实测范围

未实际发起付费生图/生视频或耗额度的Agent生成；真实整剧成片仍待管理员试跑。临时会话实测针对本机Codex，其他ACP Agent持久化行为不能一概承诺。有限的预设链不能保证服务商必定成功；不会在所有路径失败后擅自超次数扣费或换未授权模型。
