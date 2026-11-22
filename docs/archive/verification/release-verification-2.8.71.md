# 2.8.71 验收记录

日期：2026-10-25。基线：已发布2.8.70。依据用户截图中的第24集电话声音反复补全问题实现。

## 行为规则

- `core/artDeferredDetails.js` 为每张卡保存源正文指纹、卡片指纹、尝试次数和状态。自动信息读取最多尝试3次；三次仍缺依据后进入waiting/unresolved，自动流程使用`artEpisodeTraversable`继续后集，人工核实仍沿用严格完整条件。
- 后文回填只接受带来源集号、逐字原文引句的证据；visible=true还必须提供当前集可见原文。电话/画外音不自动变成可见人物，只有同集有明确出镜原文时才允许判断可见。声音信息保存到voiceDescription，后文服装不会写回电话场景的场景关联。
- 后文相同人物按基础身份和已分析正文检索，先回填前面待补卡，再进入下一集；重复相同证据不重复请求。前集非可见/信息不完整卡不能作为后集首次可见基准。
- 目标集正文改变、后文证据来源正文改变或人工修改时，旧标记/已回填来源失效；机器结果按指纹保护，人工改动不被还原。正文变化后重新读取本集并重新计数。
- `ArtDeferredPanel` 显示待补/已回填、尝试次数、原因、声音描述、来源集与原文依据，可点击来源返回对应集；内部列表限制高度，保持核实界面紧凑。

## 验证

- 定向分析、工作流、详细信息、身份继承回归66/66通过，覆盖三次限额、停止恢复、全文无依据、后文合法/非法证据、来源失效、正文变更、同集出镜加VO、人工编辑保护及首次出镜锚点。
- 全量 npm test：2395/2395通过，13 suites；npm run build通过。output/tests-2871.log、output/build-2871.log。
- React + Edge面板验证通过：展开待补与回填面板，显示“1待确认 · 1已回填”、三次尝试、来源集按钮，点击来源跳转标题；页面无异常。output/playwright/art-deferred-2871.png。
- 所有验证均使用模拟项目和模拟AI接口，没有向用户项目发起付费请求或修改真实核实清单。

## 安装包与发布

- 源码652652b已推送main。NSIS及实际安装解包/运行时验证通过：qa/packaged-smoke-2.8.71-1792942579437/report.json，版本2.8.71，errors=[]。
- 本机包 release/2.8.71/Xingzhou-Film-Tencent-Setup-2.8.71.exe，103837760字节，SHA256 b433e8c4ec298263ddd5938e501daa991269af0fca7ef10be449a3263186b59f。
- GitHub公开包：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.71/Xingzhou-Film-Tencent-Setup-2.8.71.exe；官方镜像：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.71.exe。
- 两个main的latest.json签名、版本、大小、SHA256与GitHub资产digest一致；官方IP固定证书、Range206、MZ与Content-Range总长核验通过。output/public-2871-verification.json。
