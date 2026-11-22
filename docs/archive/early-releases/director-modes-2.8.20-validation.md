# 导演两种模式正文一致 / 2.8.20

日期：2026-10-09。

根因：2.8.19 仅覆盖 quick-scene-textarea，创造模式的正文没有此类，继续继承 #232b38；只读背景为 #fcfdff。实际 App 模拟接口基线验证两种模式显示同一份剧本，祖先 opacity 均为 1、filter 均为 none。不是背景叠加导致文字变色。

修复：两个正文编辑区共用 director-script-body 类，统一 #000 文字与文字填充、#fff 正文底色。未改变字体大小、行距、只读/编辑状态、保存和生成逻辑。

实际 App 模拟接口验收通过：两个模式和全部内部格式元素的 color、webkitTextFillColor 均为 rgb(0,0,0)，编辑区背景均为 rgb(255,255,255)，字号仍 15px、行距仍 27.75px。创造模式继续只读，快速模式继续可编辑。四次重复切换内容一致；快速模式修改后，创造模式立即显示同一修改。1920×1080、1100×850 截图已查看，未调用付费模型。

独立最终只读复核通过，无发布阻塞。npm run build 通过。

安装包实际启动验证通过：qa/packaged-smoke-2.8.20-1791557256328。文档导入、美术账本、世界模拟、回收站、网页模型、号池、画布与权限边界检查通过。

实现提交：271ee7b。npm test 首轮有两项失败（本地测试接口连接、Windows 测试进程清理）；相关 25 项单独复查全部通过。第二轮全量仅测试进程清理失败。按相同 scripts/test.cjs 套件列表，以 --test-concurrency=1 顺序执行，1,882 项、13 套件全部通过。没有修改或跳过测试。

安装包大小：102777400 字节。SHA256：171c6314f1643cd3799d7a48079e1b102ab76663dee7e578346c6e9a4f78925a。

发布：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/tag/v2.8.20。

两处公开 latest.json 完全一致，完整下载公开安装包的大小和 SHA256 与本地及 GitHub 资产摘要一致。实际客户端读取 2.8.20，Ed25519 签名验证通过。报告：output/playwright/director-modes-2820-public.json。验证日志：output/playwright/director-modes-2820-*。
