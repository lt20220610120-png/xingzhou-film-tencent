# 2.8.39 资产分类批量生图验收

日期：2026-10-16。基线6c4dd76，分支codex/asset-category-batch-2.8.39。仅客户端改动，无云端部署或数据迁移。

## 行为

资产总览的当前人物/场景/道具分类新增API模型、画幅、并发与一键生成。默认选中未生成资产，人物包括隐藏在妆造切换内的所有妆造。提供逐资产勾选、人物整组选择、全选未生成、取消全选。搜索仅缩小展示，生成范围说明和数量明确显示。切换分类重新选当前分类未生成项，正常刷新保留人工取消选择。

复用planArtImageBatch和runArtImageBatch、现有参考选择/草稿/原任务恢复/保存接口。批量默认并发2，可选1/2/3/4/6/8。先基准再差异，基准失败不调用差异任务。成功项在云端刷新前主动取消选择，失败和未开始项保留；相同事件周期双击由同步锁阻止。已生成资产仅在人工明确勾选后新增图片，历史图片保留。未关联历史资产只读查看，不批量生成。

## 验证证据

- 新core/assetCategoryBatch.test.js：默认全妆造、去重/历史过滤、分类及取消选择、手动已完成项、原美术默认不变、基准失败阻断。红4/4后实现变绿。
- 新electron/asset-category-batch-v2839.test.cjs：执行真实批量入口，模拟云端刷新仍返回旧无图列表，成功项移出选择且第二次点击不重复生图；同tick双击、只读用户不得提交。发现成功项依赖刷新取消选择的风险后，红1/3→修复绿3/3。
- 独立只读复核及13项相关测试通过，未发现剩余发布阻断。
- qa/asset-category-batch-v2839-ui.cjs：真实React + Edge headless，模拟桥接I/O，拦截非本机网络。验证默认选择全妆造、取消后刷新、API模型选择、基准依赖与参考传递、显式已有图片追加保留旧图、分类切换、勾选子集、搜索范围、并发2、停止保存在途/保留排队、失败仅一次、场景范围、历史页禁用、1280宽无溢出。8次模拟生成、7次模拟保存、pageErrors0，真实付费调用0。
- 界面证据output/playwright/asset2839/report.json及01/02/03 PNG。复跑需先启动Vite到127.0.0.1:5789，PLAYWRIGHT_MODULE指定可用Playwright模块。

## 打包

npm run dist完成：2138/2138测试通过，0失败；前端构建、NSIS打包、安装包运行时检查通过。运行时报告qa/packaged-smoke-2.8.39-1792087744020/report.json。

安装包release/2.8.39/Xingzhou-Film-Tencent-Setup-2.8.39.exe，103610951字节，SHA256为12b747f0f7f3939f07d7df7078c408bbb243d3c9b04b96a47d75a02765bc6e3e。

公开地址：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.39/Xingzhou-Film-Tencent-Setup-2.8.39.exe 。已发布正式Release、双仓库main签名清单（源仓库ef8e6d6）和官方备用源。公开整包完整下载103610951字节、SHA256与本机和GitHub asset digest一致，两清单一致；备用源Ed25519签名、65536字节Range/总大小和服务器完整哈希通过。

本机正常关闭旧窗口后安装启动2.8.39，ProductVersion为2.8.39.0，app.asar与验收构建完全一致，主进程响应正常。升级前后D:/行舟影视/xingzhou-data.json完整哈希相同，API配置、媒体配置和74个导演项目相同。

正式更新链路实测：同产品fetchUpdateManifest、createUpdateFetch及interpretUpdateResult从官方源读取签名2.8.39；2.8.37/2.8.38均返回available=true及“发现新版本2.8.39”，2.8.39返回当前最新。记录output/asset2839-inapp-update-verification.json。公开验证output/release-2839-public.json，安装验证output/asset2839-install-verification.json。
