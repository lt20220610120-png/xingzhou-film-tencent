# 2.8.35 导演多人协作完整性验收

日期2026-10-13，基线2.8.34提交0a469d4。用户截图：项目名/标题/状态/画幅翻倍、重复分集、集号与场景错位，顶部仍显示已同步。

## 只读取证与根因

本地与PG READ ONLY核对受影响项目：82条集记录但仅41个唯一ID；script174142字符；134条prompt记录，仅67个唯一成果。Y.Text name可见两段相同完整初始化文字，来自不同root seed client；历史版本1–11正常，12开始结构字符串串接，13开始重复@item别名。29个增量中有一份约1991762字节的独立完整seed。

旧codec将ID、标题、状态、枚举与正文一并当Y.Text。不同初始化seed串接字符串，旧read回双ID；下一次flatten以双ID新增@item，与原ID并存。仅修UI不解决数据问题。

修复实验读取本地缓存副本，真实文件与项目未覆盖：修复后41集/41唯一ID、87071字符、67条/67唯一提示词，285处相同seed文字修复，41重复记录合并，独立差异0。统计不包含用户正文、凭据或API Key。证据output/director-live-2835-audit.json及同版本copy-repair报告。

## 当前契约

protocol3：普通结构字符串atomic；script/分集content/quickSceneEdits/sceneVisions/提示词content等可编辑正文继续Y.Text。record ID从@rank结构键取值。shared helper检查未知root initialization；server apply后再校验epoch/protocol与结构。

服务端要求protocol3，旧客户端426明确升级；新基准epoch变化时返回全量reset、不确认/应用旧delta。新client先取server canonical，只合并同protocol/epoch本地cache。历史恢复用新Ydoc而非对旧损坏doc编辑。无新SQL结构迁移。

旧健康doc保存baseline后升级；损坏doc只检查、暂停，不自动覆盖。制片preview仅返回建议；apply核对revision+Y-state SHA256、防过时确认，锁/成员权限在项目行锁内重核。repairLegacyDocument只认可两个独立root seed的完全相同可见chunk及对应ID别名，普通重复句/不同创作不靠字符串对半猜测。有独立scalar差异时列conflicts、拒绝apply。采用先保存原始云端baseline，再新epoch和restore历史。历史不删除。

客户端旧cache/raw state换epoch时由后台写线程先另存.baseline-backup。UI本地版本同时保留较新缓存稿与主资料稿；promptHistory可预览及取回为独立本地副本。主资料updatedAt明确较新且同epoch的顺序本地稿冲突时，归档双方并优先较新本地稿，继续delta同步。停止/账号目录变化检查保持。

独立复核发现并补齐：中文IME flush=false时inFlight同步返回后赋值，可能永久占用request slot；改为Promise微任务启动并加生命周期门槛。撤权/锁定期间新写入先capture/checkpoint，权限回包不覆盖最新人稿。30项独立复核相关专项及完整构建验证见发布记录。

## 界面与服务器证据

真实React三独立browser sessions（owner/a/b）+本地合成服务：异常暂停→制片预览→确认→三成员自动新epoch重连→owner导演构想、a快速编辑、b第二集构想→a mock生成提示词→owner/b右侧可见，metadata和集ID保持唯一。截图output/playwright/live2835-repair-preview.png、live2835-three-members.png、live2835-shared-prompt.png。仅favicon404；未使用实际付费模型、用户密钥或真实项目写入。

服务器Node18阶段测试PG临时表五成员：同字段/缺失字段合并、提示词union、幂等收据、旧协议426、独立seed409、restore/reset不应用旧delta、producer预览不写、成员预览403、过时确认409、repair前后两历史、锁定/撤权/回收隔离；测试回滚全部临时数据。证据output/live-2835-stage.log。正式部署与发布验证完成后补记。

正式部署：服务器两文件代码与2.8.34基线一致（仅CRLF差异），部署前实际SHA256固定核验；备份/回滚目录`/opt/xingzhou-backups/director-live-2.8.35-20261013T134421Z`。替换src/director-live.cjs和shared/directorSharedDocument.mjs，service active，`/healthz`返回ok；正式模块PG临时表专项再通过。无SQL schema修改，无真实项目数据代修或历史删除。最初健康探针误用`/health`得到404，核对路由后改用`/healthz`成功，保留原日志。

首次完整dist测试2078项中，WorkBuddy Windows fixture结束时遇到“Fixture process identity mismatch”hook失败；该文件独立重跑21/21通过，关闭验收浏览器/服务器减小并行负载后重新做完整dist；结果待下方发布证据。未修改WorkBuddy生产代码或放宽其进程身份检查。

完整正式重跑dist：2078/2078全量测试，0失败；Vite构建成功；NSIS安装包运行验证PASS，`qa/packaged-smoke-2.8.35-1791899389542/report.json`版本2.8.35、errors为空。独立复核30/30专项及stop晚响应检查通过，无未解决阻塞；本地copy恢复统计复验通过。构建证据`output/release-2835-build-final.log`。安装包103609052字节，SHA256 `2a26f797254d3e5369d66dce2a0780bd98c454fbebb36127f5d439dfd786f615`。

正式Release、双仓库main签名清单与官方备用源已发布，功能提交d1ff942、签名清单14d9866。公开整包完整下载、大小、SHA256与GitHub asset digest通过；两份清单Ed25519签名通过；备用源服务端整包SHA256和客户端清单/65536字节Range/总大小通过，未重复下载备用源整包。证据output/release-2835-public.json、release-2835-mirror.json、release-2835-publish.log。

[公开安装包](https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.35/Xingzhou-Film-Tencent-Setup-2.8.35.exe)；本机release/2.8.35/Xingzhou-Film-Tencent-Setup-2.8.35.exe，103609052字节，SHA256 `2a26f797254d3e5369d66dce2a0780bd98c454fbebb36127f5d439dfd786f615`。所有成员升级，制片对异常项目预览并确认修复；不宣称已替用户覆盖真实项目。
