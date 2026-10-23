# 2.8.65 发布验收

日期：2026-10-23

- 两套按提示词关联页统一白色/浅紫灰，字段横排，图片区完整比例；无关联业务逻辑改动。
- 关联列表内部高度 300px（独立）/350px（协作），图片身份列表 330px；overscroll-behavior:contain，支持键盘聚焦。
- 全量 npm test：2341/2342 通过；唯一 Windows 窗口最小化断言在并发测试失败，单独运行 electron/windows-background-browser.test.cjs 4/4 通过。
- npm run build 通过。
- 生产打包 React 验收：qa/binding-layout-2865.cjs 在 640/1280/1700/2232px 两页面通过；各12关联卡片、24身份图片压力显示，内部滚轮移动280px且整页位置不变，无横向溢出、无页面异常。宽窗三字段同一行。
- 既有 prompt-art-binding-ui 两宽与 imported-art-simple-ui 三宽通过：确认、重载、精确素材子集、来源过期拦截、AI有限修正、退出保留与迟到响应忽略；模拟接口未收费。
- 独立只读复核发现窄窗字段级联和 cover 裁图，已改单列/最小宽度和 contain，最终重跑 UI 通过。
- NSIS 2.8.65 打包与 packagedRuntime PASS；公开包管理员权限、关联桥、媒体、文档、沙盒及启动自检通过，未关闭用户正在使用的窗口。

复验界面：npx vite build --config qa/binding-2865-build.mjs；python -m http.server 5836 --bind 127.0.0.1 --directory output/binding-ui-2865；node qa/binding-layout-2865.cjs。结果在 output/binding-layout-2865.json。

发布完成：源码9ebb633；GitHub v2.8.65与官方IP镜像、两个main签名清单均已核验。安装包103812885字节，SHA256 4141a425a929e0255120617baf5a8045e8480fa7c635725dd944326e3b992b26，GitHub资产digest与HEAD总长相符，客户端原生固定证书备用源206 Range通过；域名直连TLS在本网络失败，原客户端IP备用源正常。公开地址 https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.65/Xingzhou-Film-Tencent-Setup-2.8.65.exe 。本机release/2.8.65/同名包。
