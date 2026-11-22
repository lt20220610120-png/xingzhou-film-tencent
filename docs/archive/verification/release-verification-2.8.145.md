# 2.8.145 发布验收（2026-11-10）

## 需求与实现

- 分镜参考素材弹窗拆为 ProjectResourcePicker，上传按钮移至搜索工具栏，独立分类、素材滚动区、底部操作栏；白字紫底确认引用。搜索框局部清除共享表单 margin，避免旧样式串入。
- 音频候选合并 currentSnapshot.voiceCards 的已采用音色与普通项目上传音频，使用原稳定引用 ID，保留人物/年龄名称和本地/云来源，不按当前场景过滤；未采用、无媒体及其他项目排除。关闭联动也能读取，刷新通过既有 binding 缓存失效机制重读，不修改真实工程。
- media-export-file 保存窗口指定实际源格式，改名时保留扩展名；补后缀碰撞通过 COPYFILE_EXCL 拒绝未经确认的覆盖。视频、图片、WAV/MP3/M4A/AAC/FLAC/OGG 原字节保留。分镜本地及仅云端结果都传当前分镜编号，内置画布既有导出入口共用修复。
- 用户追加分镜结果接近方形：仅分镜启用 square，卡片240×244，成功/失败/生成中等高，单行摘要、图标原画布/复用及下载操作，错误用可键盘聚焦 Tooltip；无卡内滚动。横屏视频预览仍按原比例，不裁切或拉伸成片。

## 验证

- RED→GREEN：最初7项中5项失败，修复后7/7；追加 AAC/FLAC 类型矩阵失败→通过。云独有结果文件名 undefined→1-1-1 的真实UI红绿回放；原细长159.25×280触发近方形断言失败，新240×244通过。
- 最终 npm test 2902/2902、13 suites，output/145-tests-final.log；最终构建通过 output/145-build-final.log。
- 新真实React UI：scripts/verify-resources145-ui.cjs。关闭联动仍显示跨场/年龄音色；真实WAV试听、搜索、稳定ID保存/重开、取消/Escape、刷新新增采用音色、本地上传自动选中、图片网格、当前分镜下载命名均通过。弹窗1280/1700/2232及结果1280/1502/1700/2232通过，无溢出/内滚动，单结果不拉伸。1502宽3列、2232宽6列。截图与report见 output/playwright/resources-2.8.145。
- 上版全量交互回归 scripts/verify-media-layout-144-ui.cjs 通过：五宽结果等高、编辑器拉高/引用菜单/参数对齐、两集三场范围保存/重开、单删/全删确认、取消/Escape不删除、视频池默认最新/历史范围导出。唯一调整尺寸断言为≤250以符合用户新要求。
- 真实原片只读导出到 output/review-145/video-export：LibTV1-6-1 9585882字节、17.056秒；另一个fnko原片28259175字节、30.048秒。无后缀输入最终均为MP4，SHA256逐字节一致，ffprobe均H264视频/AAC音频。原文件与用户导出目录未修改。
- 独立复核两次：补齐AAC/FLAC与云结果分镜命名，增量方形卡无待处理问题；复核者独立运行新React UI通过。
- 纯客户端更新，无云端代码/schema部署，未付费生成、重发旧任务或修改真实项目。

## 安装包与公开发布

- 最终包 D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.145/Xingzhou-Film-Tencent-Setup-2.8.145.exe，104067939字节，SHA256 `b02a5528dd8fb650f26dab92ccacb19a14995f2692ca17bd7baca8878452604c`。NSIS及实际运行验收 qa/packaged-smoke-2.8.145-1794316011788/report.json通过；真实打包运行视频/音频播放、下载字节一致、画布渲染通过。
- 首轮打包受下载运行时临时目录rename EPERM影响；最终使用已有本机Electron43.2.0运行时构建并通过相同完整运行验收，未改应用逻辑或权限。
- 实现6919a45已推送；GitHub Release 440376596 安装包uploaded，资产digest与本机一致。官网及两个GitHub公开latest.json逐字一致并验签通过，官网完整文件服务器SHA256及公开Range206/65536字节一致。
- 生产更新读取逻辑检测到2.8.145，来源https://106.55.41.128/api/updates/latest.json，保留签名、CA、证书指纹校验。证据output/review-145/public-verification.json及in-app-update.json。
- 官网包：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.145.exe
- GitHub包：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.145/Xingzhou-Film-Tencent-Setup-2.8.145.exe
- 发布期间仅使用本机TLS内的GitHub凭据，SSH透传通道不解密GitHub TLS；本轮临时通道与QA服务器用毕关闭，用户Clash/TUN与软件网络配置保留。
