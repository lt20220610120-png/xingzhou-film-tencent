# 2.8.72 发布验收

日期：2026-10-26

## 范围

本版把美术整场清单与逐条提示词分发分层，提示词按内容指纹保留历史版本；协作核实支持整场/提示词两种入口，缺项核查需要本场和全剧原文依据；图视生成支持项目版本载入、提示词级图片分发、提示词目录导出和本条素材导入。

## 验证

- `npm test`：2403/2403 通过。
- `npm run build`：Vite 构建通过。
- `npm run dist`：NSIS 安装包生成，`verify-packaged-runtime.cjs` 实际运行时冒烟通过，版本为 2.8.72。
- 定向测试：版本隔离、图片延后接入、场景缺项证据、按提示词导出/导入及旧目录兼容 24/24 通过。
- 界面模拟：1280px、1700px 宽度通过；分析方式位于标题栏，整场/提示词核实切换、版本切换、旧版分发和新版本待核状态正常；无横向溢出，无真实付费请求。

## 包与公开更新源

- 安装包：`release/2.8.72/Xingzhou-Film-Tencent-Setup-2.8.72.exe`
- 大小：103843046 字节
- SHA256：`f0ee4d7d1f94e277995564252250fdcad19f89821f25f99a7aada576cc19641e`
- GitHub 下载：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.72/Xingzhou-Film-Tencent-Setup-2.8.72.exe
- 官方镜像：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.72.exe
- 发布脚本核对：GitHub Release 已创建；更新源双清单与官方镜像已写入并核对版本、大小及 SHA256。

## 限制

未使用真实用户项目或付费生成接口。提示词版本历史以本机联动记录保存；来源发生变化时旧分发进入待核，需在协作核实重新确认。
