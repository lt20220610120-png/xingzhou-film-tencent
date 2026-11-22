# 2.8.75 发布验收

日期：2026-10-26

- 浏览器：1280/1700 两种宽度下，协作/图视生成均左右等高、无横向溢出；编号切换、分类筛选、保存重载通过。footer 在工作区之后，没有覆盖内容。
- 模拟 AI：无效响应有限修正；属性伪卡片消失；缺手电筒时查证原文、补入整场清单并关联，未自动发布。未调用真实付费模型。
- 回归：新增旧记录迁移、属性/时间/否定词拒绝、分发免逐条确认但保留场级发布门禁测试。
- 首轮全量2407/2408，Windows独立浏览器临时连接失败；该套件独立重跑4/4通过。最终 `npm run dist` 全量2408/2408通过，Vite构建、NSIS打包及实际安装包运行时验证PASS。
- UI脚本：scripts/verify-binding-distribution-ui.cjs；证据：output/ui-2875.json、review-2875-*.png、imported-2875-*.png。

安装包：`release/2.8.75/Xingzhou-Film-Tencent-Setup-2.8.75.exe`

大小：103835077 字节
SHA256：`025c4f06142239a11cba34d124a496e45d3bed81206e64ba9abe2671541cec9c`

发布前复核：旧记录签名失效与锁定选择、AI三次有限校验、整场发布门禁、缺项双向回填、模型选择、版本切换、两页面左右结构和底部位置均核查。

源码提交：1f9787e。公开双GitHub与官方镜像latest.json已核对版本、下载URL、大小和SHA256一致；镜像Range返回206且总大小一致。证据：output/public-verification-2875.json。

公开下载：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.75/Xingzhou-Film-Tencent-Setup-2.8.75.exe
官方镜像：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.75.exe
