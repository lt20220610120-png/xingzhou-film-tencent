# 2.8.158 验收

当前用户要求不同 Skill 都由 Agent 阅读并执行，软件不从文档猜测一个内置提示词合同。正式入口的人工、自动和整本生成均传递完整所选 Skill 及全部附属文件，提示词内容规则和自检由该 Skill 决定。

- 自动控制器默认只核对外层编号、条数、完整正文是否可分发。保存原始回包后展示右侧，跳过固定语义审核请求。正文的比例、字段、对白和光影不通过内置模板修改。继续未完成任务也清理旧模板质量提醒，并沿用原付费结果。历史审核代码仅供旧行为回归显式启用，正式界面未接入该选项。
- 专项使用百分比、分数、自定义比例和字段分别模拟回包，保存与模型正文相同；继续完成任务不增加生成次数。真实隔离 React/Electron 验证完整附件进入请求，`hold` 自定义比重显示在右侧，模型请求为规划和 Skill 两步。内容预估45秒确认后，单条上限改15秒仍为45秒，三条15秒均保存。模型回包为模拟，未发生真实付费生成。
- 内容预估与单条上限解耦，详见 2.8.157 验收。LibTV 改动和现场只读边界详见 2.8.156 验收。2.8.156、157 的 GitHub 草稿上传已取消，正式清单未切到这些中间版本。
- 2.8.155 直接基于 2.8.154 提交构建。两个安装包内的 LibTV 网络服务和旧比重校验文件相同。旧校验要求百分比，对分数 Skill 会误报，未找到将分数改成等分的本地实现。旧测试使用模拟正文且未覆盖客户 Skill，是此前验收的缺口。
- LibTV 追加混合线路回归。即使全部 API 域名回退直连，系统代理启用时仍保留本机受限 CONNECT 转发，素材域名独立选择线路。否则 API 直连可用、素材仅代理可用时旧客户端会误将素材也强制直连。
- 最终全量 `3070/3070` 通过，日志 `output/158-tests-final-all.log`。测试使用既有 Python 3.11 与并发4以通过 Windows 测试进程清理。新版隔离界面报告 `output/158-ui-final-stdout.log`，真实 API、素材域名只读记录 `output/158-libtv-after.json`。

## 安装包与公开发布

- 安装包 `release/2.8.158/Xingzhou-Film-Tencent-Setup-2.8.158.exe`，104044364字节，SHA256 `2bd15d5d36fb10906c7b882bad90c838e73ad597be13bd72599377ec37949cfb`。
- 最终打包运行报告 `qa/packaged-smoke-2.8.158-1794545811210/report.json`，PASS，errors为空。7份关键ASAR文件与源码逐字节匹配。
- GitHub Release `443827392`，资产uploaded，size和digest一致。GitHub侧用已发布2.8.154及差异文件恢复完整安装包并校验SHA256，上传后再次读回digest；运行 `43369610525` 通过。首次上传步骤成功后，草稿尚无公共tag导致末项验证404，改按release ID验收重跑通过。发布脚本复用已验证资产，镜像清单和两仓清单均完成写入。
- 官网、更新仓和源码仓三份公开清单完全相同，Ed25519验签通过。公网Range206首64KiB与本地相同；官网HTTPS服务整包输出SHA256与签名清单相同，证据 `output/158-official-service-sha256.txt`。正式更新传输使用官方IP源读回2.8.158。
- 真实更新弹窗与preload/IPC隔离验证模拟当前2.8.154，读取真实2.8.158签名清单，点击下载从官网续传末64KiB，整包校验后点击安装，隔离安装回调再次校验通过。没有启动用户客户端安装。证据 `output/158-update-ui.json`，`output/158-public.json`。

官网下载 https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.158.exe

GitHub下载 https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.158/Xingzhou-Film-Tencent-Setup-2.8.158.exe
