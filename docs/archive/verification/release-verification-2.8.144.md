# 2.8.144 验收记录

2026-11-10，用户要求紧凑生成结果、视频池一条提示词一张固定卡、默认下载最新成功结果并支持全选、长参数时左侧编辑框自适应且素材底部对齐。

## 实现

- GenerationResults 对视频使用紧凑卡片，150px最小轨道、16:9预览、两行提示词、保留任务状态/失败原因/复用/下载及大预览。
- 视频池按集/场/提示词合并生成历史；采用已发布storyboardPrompts，不再被导演未发布稿替换或产生同号重复卡。云回执与本机mediaId去重，支持sourcePromptId别名和跨项目隔离。无结果、排队、成功卡统一166px，不在格子里嵌完整结果区。
- 卡片打开键盘可关闭的结果对话框，默认每条最新成功结果。生成中或失败的新尝试不替代可下载结果。主下载按钮按当前集场范围选择每条最新；显式一键全选跨分页选择范围内所有成功历史，支持恢复最新、同条多选和下载所选。本机任务优先本地文件，云端记录用mediaId，避免本机已下载结果仍依赖旧云URL。
- 导出继续走原登录/项目权限校验及一次文件夹选择；目录按项目/集数，文件名使用已发布分镜编号+记录ID，重复ID只导出一次，重复导出校验相同内容，不覆盖不同文件。
- 左列增高分配给提示词wrapper，素材区自然高度、最大260px独立滚动并置底；素材限制等辅助状态移到编辑框之前，通用生成与分镜共用规则。保留原生wrapper拖拽拉高，textarea填满wrapper，引用层保持跟随。

## 验证

- 真实 React/Edge 五宽1280/1502/1700/2232/2560，首行分别3/5/6/7/7个现有结果，卡宽约150–200px；同条多任务只一张卡，全部等高，默认/全选/手动两选的真实提交ID断言通过。
- 长/短LibTV接口切换使prompt高度相应变化，refs与controls底差<3px；独立图视生成含11条音频/容量提醒及真实鼠标原生拖拽+150px，素材不重叠且左右底仍对齐。
- 核心选择与真实临时文件导出验证：默认只导出new；选择old+new+new只导出两个正确文件且保留原路径冲突保护。核心/导出4项通过。
- 证据scripts/verify-media-layout-144-ui.cjs、qa/media-layout-144.*、output/playwright/media-2.8.144/。UI生成、云读取和下载接口均模拟，未提交付费模型请求或写用户真实项目。
- 全量测试及构建、打包、公开下载校验见发布补充。

新增：范围参数持久化需要云端storyboard-merge及storyboard-settings模块配套；无schema变更。公开包：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.144.exe


## 用户追加要求

- 结果卡片统一280px高，不随任务状态/媒体是否存在改变大小；任务详情在固定卡片内展开滚动。
- 分镜和视频池的单条/范围全部删除均经过DeleteConfirm；取消/Escape不调用删除，嵌套确认不关闭底层结果弹窗。视频池删除受当前集/场/状态筛选限制，按确认时捕获的ID清单执行，新到结果不会被误删。只删除记录与对应云视频，保留本机文件，后台未完任务不重新提交且继续追踪；保存projectVideoDeleted墓碑，异步完成不复活。重开、云回执去重和readonly/锁定/账号切换都核验。
- 顶部全场景/全剧由真实storyboard-patch settings操作落库，白名单参数只更新generationConfig，不改提示词与素材；全剧覆盖全部集场并清除之前的场景覆盖，场景只更新其本场。未渲染分镜与旧本地草稿通过revision生效，过期在途保存不能盖回旧参数，后续同revision手动单条参数仍可修改。新建分镜与新导演分集继承范围默认。
- 扩展真实React UI调用实际云端patchShot纯函数模拟路由，跨2集/3场验证范围隔离、切换、重开；生成中单删、全部删除、确认前0调用、取消/Escape保留数据和后台不复活均有覆盖。所有网络/删除目标都为隔离夹具。


## 配套部署与最终回归

- 全量2897/2897（13 suites），output/144-tests-final-all.log；早期旧静态入口检查仍匹配已替换的collabDeleteMedia，已更新为专用projectVideoDelete并覆盖实际删除功能，14/14回归与全量通过。
- 云端只部署storyboard-merge.cjs及新增storyboard-settings.cjs，阶段13/13、健康检查与systemd active；无schema变更。备份/opt/xingzhou-backups/storyboard-settings-2.8.144-20261110T110640Z。
- 线上SHA256：merge 85f2b73ba872cb05d3b6950b0e83f319102acf9a485af5ad62b41e6020a81875；settings a1a723d61a2f53cade57cea794940978080e9279a1549950a0878791e6037a70。

## 最终安装包与本机安装

- 实现提交3128c1c已推送。最终构建output/144-build-final-all.log；打包output/144-package-final-all.log；NSIS实际运行验收qa/packaged-smoke-2.8.144-1794308995001/report.json通过。
- 安装包release/2.8.144/Xingzhou-Film-Tencent-Setup-2.8.144.exe，104048004字节，SHA256 `60089c48120e7d9aca7e14818ffb9c5c8c5a5023b94d826fd5de8c96ef73540c`。
- 本机已安装到D:\行舟影视客户端\Xingzhou Film Tencent Edition，文件版本2.8.144；已安装app.asar与最终验证包逐字节哈希一致，SHA256 `fb681df4d9873a13eabeb49ab8547c12504ae901f54e7f22bb8b384607edd184`。桌面行舟影视快捷方式指向该安装，应用主窗口已启动；证据output/144-installed-verification.json。
- 用户项目、素材、任务记录及本机网络选项保留；安装时网络选项为enabled:false、interfaceName:WLAN，未擅自开启。未对真实用户项目执行批量参数写入、素材删除或付费生成；范围/删除/下载语义由隔离React夹具和核心真实临时文件测试验证。

## 公开发布完成

- GitHub Release440259797、v2.8.144安装包uploaded，104048004字节，GitHub资产digest与最终本机SHA256一致。
- 官网和两个GitHub仓库的公开latest.json均为2.8.144，与本地最终签名清单完全一致且验签通过；官网完整文件远程SHA256和公开Range 206/65536字节验证通过。
- 生产客户端更新逻辑以官网IP优先源识别2.8.144，保留CA、证书指纹和清单签名校验；证据output/review-144/public-verification.json及in-app-update-official.json。
- 官方安装包：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.144.exe
- GitHub安装包：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.144/Xingzhou-Film-Tencent-Setup-2.8.144.exe
- 发布过程因GitHub大文件线路超时更换临时TLS透传通道，令牌仅在本机TLS连接中使用，未复制到服务器；未修改用户Clash/TUN配置。
- 官网镜像使用143已核验原包及4088915字节gzip差量构造144；本机独立临时目录重建和服务器重建均校验最终完整SHA256，仍使用原install-update-mirror.sh核对文件大小、MZ、manifest及完整哈希后原子发布。未改变最终安装包内容。
- 收尾已停止本次临时DIRECT实例，17997及QA5884均无残留监听，上传SSH隧道已退出；恢复临时镜像wrapper。用户自有Clash进程与配置保留，证据output/review-144/helper-cleanup.json。
