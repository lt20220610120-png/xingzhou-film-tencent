# 2.8.69 验收记录

日期：2026-10-24。基线：已发布 2.8.68。用户提供 14 张界面截图；本次使用当前 checkout 直接实现。

## 客户端

- GenerationResults、ArtWorkflowControl、ProjectCompositionControl、整本/联动/独立关联、设置、导演、Skill/API 及授权管理精简重复的操作说明；保留错误、实际任务状态、价格/限制、确认弹窗和业务正文。
- PromptBookWorkspace 顶部集中为标题操作、素材来源、文档选择三行，载入选择器按需展开，保留上传/原编辑/独立关联/联动载入等功能。目录横排。
- 美术概览生图按钮移到构图行右侧；ProjectCompositionControl 增加操作插槽；导演云端管理与标题对齐。主栏 176→162px，原有紧凑断点沿用。
- 分集卡片 #f2fbfd、文字 #171a20；群成员栏 #f3fbfc；页面外背景沿用原主题。
- Win AI 去除顶部栏；44px 左控制条与 native host 分开，刷新按钮位于底部，不被 WebContentsView 覆盖。使用打包导入图片路径，避免 file:// 下绝对 / 路径失效。
- 切页 hide，切回重新鉴权后复用 view；显式刷新 reconnect=true 重新交接。退出/身份变化销毁私有会话。presentation 序号阻止离开后迟到 resume 覆盖别的页面。周期鉴权在 loadURL 前开始；dom-ready 可提前显示，仍保留全部资源完成与失败处理。

## 网站增量部署

- 定位：网关脚本实际 Content-Type=text/javascript，nginx gzip_types 漏掉该类型。固定主脚本原始 5,107,603 字节，约 13.50 秒；补齐 gzip 后传输 1,828,409 字节，约 4.51 秒。这是本机单次对照，不是所有网络的时延保证。
- 仅增量修改 nginx 的压缩类型、favicon 注入与 /opt/win-ai/public/brand.svg；图标直接封装用户提供 PNG。未重跑基础安装或身份迁移。
- 部署脚本 win-ai/scripts/deploy-ui-refresh.py：匹配预期配置才修改、先备份、nginx -t 后 reload、异常恢复。生产备份 /opt/xingzhou-backups/winai-ui-2869-20261023T191317Z。
- 沿客户端固定证书/IP传输核验网站图标与本机字节一致，SHA256 00a2d3fc9da4813f29eb7d318064f60cbafdd958468c4530737a063c83a7b64e；控制台 HTML 包含新 favicon；压缩后脚本可完整解码为 5,107,603 字节。output/winai-2869-network.json。

## 验证

- npm test：2370/2370 通过，0 失败。output/tests-2869.log。
- npm run build：通过。output/build-2869.log。
- Win AI 复用/提前显示及独立复核发现的两项异步场景均先红后绿；electron/win-ai-panel.test.cjs 10/10。
- 独立只读复核先指出迟到 resume 和提前显示后的定时器启动时机；修复后 29/29 聚焦检查通过，无新重大问题。
- 实际 React + Edge 模拟接口，760/1120/1440/2232px：工具栏高度分别约262/230/187/187px；文档/分集切换和文本编辑保留；联动选择器开合；右侧云端按钮、构图生成按钮；分集字色/背景、群成员背景；Win AI 原生区域与刷新控件不相交；刷新传参和隐藏动作通过。没有页面运行异常。output/ui-2869-verification.json，截图 output/playwright/*-2869-*.png。
- 界面验证全部使用测试数据与模拟生成接口；没有付费请求，没有修改用户项目或清理真实生成结果。

NSIS 已打包并经实际安装解包/运行时验证通过：qa/packaged-smoke-2.8.69-1792783471839/report.json，版本2.8.69、errors=[]。含私有标记清理、授权门禁、媒体预览、文档/桥接、Win AI bootstrap/GET及Cookie销毁检查。安装包103,883,801字节。

## 正式发布

- 源码5819ae2已推送main，公开Release v2.8.69已发布，两个main的latest.json签名及完整内容一致。
- 公开包 https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.69/Xingzhou-Film-Tencent-Setup-2.8.69.exe ，本机release/2.8.69/同名文件。
- 本机大小103883801字节，SHA256 a0c47bb9cb17f8c2b5a75c4089e7fe67a7806b04bab06a9d22870eb900959f74；GitHub资产digest、公开清单大小/散列一致。
- 官方镜像已同步；沿客户端固定证书IP传输验签，Range bytes=0-1023 返回206、MZ及Content-Range bytes 0-1023/103883801。output/public-2869-verification.json。
- 真实公开网站Edge检查：新brand.svg可显示，首页截图output/playwright/winai-site-2869.png；未登录或修改任何用户账号。
- 更新记忆和开发交接手册同步；没有强制关闭或安装替换用户正在使用的客户端。
