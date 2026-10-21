# 2.8.58 Like画布误识别修复（2026-10-21）

## 原因与范围

用户截图为2.8.57-private.2。本机当前私有工作树后来已到private.3（ec33ebe）；公版基线d14e7df/2.8.56。没有覆盖私有版本的美术联动改动。

扩展旧selectedCanvas按遍历顺序取第一个ElSelect。Like的实际工作台源代码使用wb-snapshot-select及canvasSelectRef标记顶部画布选择器；节点编辑器也存在ElSelect。新增节点后参数控件先被遍历，旧方法返回doubao_seedance_2_5而不是24位画布ID，随后的check停止提交。单元夹具先复现失败，再修复通过。

新方法仅取明确标记的画布选择器；没有或存在冲突时停止。实际项目、画布、只读权限变化继续拒绝，并分别说明原因。没有按名字或任意同项目画布绕过绑定。组件升级1.0.1，保留原1.0.0安装目录，启动时同步已安装文件；浏览器须重新加载扩展及刷新网页。

本机connections.json只读检查：三个旧任务均uncertain、有视频节点ID、无taskId，不能据此宣称生成成功或未扣费；没有重投、删除旧节点或修改任务记录。实际收费生成未执行。

## 验证

- electron/like-adapter.test.cjs：新增模型/参数选择器后ID不变；缺少/冲突画布、真实切换项目/画布/权限继续停止。
- electron/like-extension.test.cjs：稳定路径、升级文件、保留额外文件。
- 聚焦13项通过，output/like2858-focused.log。
- 实际Chromium MV3 + 模拟Like网页整链路通过，新增节点动态插入模型ElSelect；参考图原字节、mention、30秒/480p、仅一次提交、取消前不生成、刷新/服务重启/浏览器重启仅查询通过。qa/like-canvas-connector.cjs，output/like2858-extension-verification.json。
- 生产构建通过，output/like2858-build.log。
- 全量测试曾在Node22出现Vite渲染套件内存耗尽及一个网络夹具fetch失败。使用项目捆绑Node重跑全量：2306通过、1个既有creator-entry-ui套件失败，Vite第二个SSR服务transport超时；独立重试记录output/like2858-ui-rerun.log。连接相关没有失败。结果如实保留，不将环境失败记为全量通过。
- 上述既有SSR套件最终单独复验2/2通过（151秒，output/like2858-ui-final.log），未修改Vite配置；全量的失败记录保留。
- 公版NSIS打包和实际运行PASS，output/like2858-package.log；103798271字节，SHA256 daef752d2c91a3855abf9af43f4a370df8a0c7c93c4d9e899fa032dba707aba2。
- 公开Release、双仓库签名latest.json、官方IP镜像签名、安装包Range/总长与本地哈希已核验，output/like2858-release-verification.json。公开下载：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.58/Xingzhou-Film-Tencent-Setup-2.8.58.exe。
- 本机专用2.8.58-private.1基于ec33ebe，保留private.3的旧人物关联与当前条目AI等功能；连接及关联回归36/36，生产构建与实际安装包运行PASS，importedBindingBridge=true；主目录output/like2858-private-focused.log、like2858-private-package.log。
- 私有安装包已复制至主目录release/2.8.58-private.1，103742807字节，SHA256 2c76f6e4f3c730d0432fb2a09a9a36036d0096276f8d621d783611742f02e50c。私有包未公开上传。没有关闭正在使用的客户端或代装公开版。
- 本机原扩展文件夹中的main.js/manifest等已同步1.0.1。仍须浏览器“重新加载”扩展并刷新Like网页，未声称用户真实页面已经完成加载或付费生成。
