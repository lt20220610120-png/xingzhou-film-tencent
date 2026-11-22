# 2.8.60 道具本体优先命名与 Like 本机连接核验（2026-10-21）

## 最终行为与兼容

新美术清单采用【道具名-所属人物】，例如【旧木吉他-Elena Suh】；无归属只保留道具名。一般属性与补充说明写在描述中，必要状态可置于道具与归属之后用于区分版本。完整内置 Skill 及 JSON 同步。

旧资产只在项目协作读取视图上生成 displayName/nameAliases，云端 name、id、描述、已生成图片、first_episode、场景和集数保持。只在有对应角色依据的“人物-物件”旧名上调换顺序，未知前缀不盲目翻转。快速定位、身份主标题/归属标签、提示词标题、参考选择、搜索和导出名使用物件优先展示。

新旧两种全名均解析为同一图片引用。基础设定匹配使用道具本体，不再把旧导出名中的人物前缀当作道具本体；项目、场景隔离规则保留。没有迁移真实项目，未重新分析/生成真实图片。

## 验证证据

- core/propNaming.test.js：旧资产身份/图片/场景保留，新旧引用同图，本体与归属精确匹配，未知前缀不盲猜。第一轮3项行为失败，修复后4/4通过。
- 完整源测试最终 **2312/2312通过**，output/prop2860-tests-final.log。首次在长路径 worktree 下触发 Windows ENAMETOOLONG；测试入口使用相对路径修复。第二轮缺 cloud-backend pg/sharp 依赖和锁文件根版本未同步，补齐开发依赖 junction 与版本后最终全量通过。
- 真实 Chromium + 生产 dist/CSS + 隔离 API 的三宽界面：1280/1700/2048，导航、主标题、归属标签、搜索、下载文件名、未生成筛选，无页面异常/水平溢出。0真实API调用。脚本qa/prop-object-first-ui.cjs，output/playwright/prop2860/report.json及截图；截图人工复核。
- 生产构建与NSIS/实际安装包运行通过，output/prop2860-build.log与prop2860-package.log。直接核对公开ASAR package.json：version=2.8.60、xingzhouPrivateTrial=false；已增加禁止公版带PRIVATE_TRIAL打包的保护。
- 2.8.59曾短暂发布初版展示调整；最终2.8.60补齐完整引用链路和正式/专用打包隔离。旧2.8.59不作为当前安装推荐；未撤销已有设备偏好或用户资料。受保护Skill正文仍为服务端执行。
- 公开Release、双仓库最新签名清单、官方IP镜像签名及Range/长度与本地哈希一致，output/prop2860-release-verification.json。
- 公开包103741465字节，SHA256 d01de0a01fc9e86d286534d2951b46297a00cd843d6d525049831ff74a796eb8。
- 本机专用包2.8.60-private.1基于原ca4cffa保留private.3继承功能；人工合并了automaticReferences与GenerationComposer差异，原导入关联实现文件未变。41/41关联/Like/道具回归通过，生产构建、NSIS、实际运行importedBindingBridge/likeConnectorBridge通过；ASAR privateTrial=true。output/prop2860-private-tests.log、prop2860-private-package.log位于prop2860-private工作树。
- 本机专用包103754616字节，SHA256 ad2c2ab5cf15ba8db0e7faa769b9c8a4b0b0973bdb95563e4a1b5dd7c43b7eb5。未公开上传，也未关闭或覆盖用户当前已测试成功的客户端。

公开包：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.60/Xingzhou-Film-Tencent-Setup-2.8.60.exe
本地公开包：tencent/release/2.8.60/Xingzhou-Film-Tencent-Setup-2.8.60.exe
本地专用包：tencent/release/2.8.60-private.1/Xingzhou-Film-Tencent-Setup-2.8.60-private.1.exe

## 本机 Like 修复结果

本机运行2.8.58-private.1。18764服务正常、Edge现用扩展onlfgiganpihobaefpfddakjgcfcfaie，安装路径D:/edge浏览器/插件/1.0.0，文件与随软件维护目录1.0.1一致，配对已保存。最初Like停在角色页，后打开工作台原未命名画布后，行舟明确显示已连接，画布尾号7cc458b5。点击保存并启用后API列表从10变11个配置，原生成项仍选FT；手动切为新Like已绑定配置，恢复30秒、9:16、480p。

用户随后明确回复“测试成功了”，这是真实本机成功证据。本代理未代点付费生成、未删除原Like节点、未提取Cookie或设备令牌。之后使用需保持Like登录并打开工作台的已绑定画布。
