# 行舟影视 2.8.51 验收记录

日期：2026-10-19；基线51659df（2.8.50）；分支codex/art-background-wardrobe-2.8.51。

## 修复与依据

1. 原AssetDetail.modifyPrompt一直await模型和保存后才关闭弹窗，状态依附卡片。改为提交即关闭，独立assetRevisionJobs按草稿store（账号）+项目+资产ID维持任务、状态与结果，切换妆造/页面后继续执行；草稿订阅使返回后自动更新。重复提交复用原任务，失败在原卡片显示并保留修改意见；空响应不落库。结果与后续人工作品冲突时不覆盖，可主动采用。账号切换验证ref和桌面authSession，避免旧结果写入其他账号。
2. API listAssets只order by created_at，同批创建时间相同的行在UPDATE后可能不同序；前端group默认选第一套会随返回序变化。prepareAssets以项目scope保留既有ID顺序，新项追加、删除项移出，再进行美术投影/分组，缓存同样顺序；不按生成状态/更新时间排序。选择边框始终3px，避免宽度切换重排文字。服务端与数据库未改动。
3. 旧新增妆造既没有明确基准引用，又没有传firstEpisode，服务端默认为1；手动未命名后缀【米洛-】会被当成基准，导致右侧等待不存在的基准图。新妆造明确引用原第一套，校验名称并按实际所选集数设置firstEpisode。历史空后缀只读识别为后续妆造，不覆盖真实云端原稿。原第一套完整提示词（优先未保存新草稿）与用户本次要求共同进入模型；人物身份/外貌继承，服装与状态按新要求更新，默认第一套第一张图，并验证实际生成payload引用正确imageId/assetId。

## 验证

- 新测试先红后绿：artInteraction、assetRevisionJobs、stableAssetOrder。core/collabAssetDrafts既有草稿/失败/并发保护回归通过；新测试含后台等待、去重、并发卡片、原资产保存、账号切换、人工新编辑冲突、最新基准草稿继承。
- 全量npm test最终2248通过、0失败，耗时185.5秒，output/tests-2851-final.log。首次唯一失败为VM提取refreshProject的旧测试夹具缺少新prepareAssets依赖；补齐夹具后包含原发布刷新保护一起通过，未放宽断言。
- 真实React+Edge+生产完整CSS，output/art2851-ui-verification.json、art2851-ui-production-css.log、art2851-ui-1280.log、art2851-ui-2048.log。延迟两个请求反序回包，切换页面卸载返回、失败保留意见、新妆造创建与参考图实际payload、美术与资产共用入口通过；3分类模拟刷新逆序及生成前后坐标一致（0px跳动），选择宽度保持，页面错误0。截图output/art2851-ui.png。
- 独立只读复核22项通过；发现第一套未保存草稿应优先于云端，已加红绿测试并修复，最终无发布阻断。
- npm run build通过。NSIS、ASAR私有正文/用户数据扫描及实际安装运行时通过，qa/packaged-smoke-2.8.51-1792358125914/report.json；继承2.8.50纯净客户端和受保护Skill、FT五类连接；视频Range206/播放拖动/同字节下载、Win AI和权限隔离检查通过。
- 测试使用隔离模拟接口；未执行真实付费生成，未读取或改写用户项目/图片/提示词，无云端部署或数据库迁移，保留现有无关Win AI改动。
- 安装包103739497字节，SHA256 b550e3e29fa179521b55e4684748b4d98bfcb1337e560f7acf6704830913f3ca。

## 发布与更新

- 功能98b4361，签名清单2bf3074。正式发布2.8.51，非草稿/预发行。公开包：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.51/Xingzhou-Film-Tencent-Setup-2.8.51.exe 。本机包：C:/Users/11599/Documents/ChatGPT/行舟影视/tencent/release/2.8.51/Xingzhou-Film-Tencent-Setup-2.8.51.exe 。
- 两份公开main更新清单完全相同，版本、下载URL、大小103739497及SHA256 b550e3e29fa179521b55e4684748b4d98bfcb1337e560f7acf6704830913f3ca一致。GitHub资产digest和HEAD200/Content-Length与本地一致。证据output/release-2851-public.json。
- 软件正式更新传输器验证签名成功，2.8.49/2.8.50均发现2.8.51，2.8.51不重复提示更新；优先官方IP镜像Range206/65536字节及总长一致。output/storyboard2851-inapp-update-verification.json。保持既有域名TLS故障回退方案，不以裸IP跳过证书验证。
- 根软件更新记忆与开发交接手册已同步。用户当前窗口未被强制关闭或改写，升级可走软件内更新或公开安装包。

