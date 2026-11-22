# 2.8.30 发布验收

- 产品源码 `bd0b552`；冻结源码 npm run dist：2027项通过，0失败；构建、NSIS及实际安装包运行PASS。独立美术存储/逐集流程/HTTP最终45项通过，无剩余阻断。
- 实际第4集本地记录只读诊断：4/4核实、4-4已发布，当前稿和上传receipt均通过客户端/本地后端校验；远端审批签名源码hash与本地一致。
- HTTP UTF8碎片回归：将网络块故意断在汉字第1字节后，旧server返回完全相同“核实版本与当前条目不同”400；request.setEncoding('utf8')后逐字恢复正文和签名，200通过，原审批/权限/版本校验保留。
- 云端单文件server.cjs已部署：备份 `/opt/xingzhou-backups/art-publish-2.8.30-20261012T000110Z`，固定原hash、前后mockHTTP2项/语法/健康/service active通过；部署后hash `3493c44e9dd50ded3a149fe4f126a50bc219053414c1d94c37b27811834fa59a`。无数据库迁移和实际项目发布。
- 客户端明确400/409及IPC标准业务拒绝错误退休旧receipt，保留本地稿和20条轻量失败metadata；旧检查点加载恢复；不明网络/回执丢失保留原幂等编号。新请求写入先清除旧syncError，后台刷新不误退休正在进行的新请求。noop本地确认不制造新待上传版本；失败metadata不上传云端。
- 顺序单场→整集→重复、并发单场/整集、丢失save/publish回执、重启、较新本地编辑、磁盘失败、旧拒绝后新请求阻塞期间load均有测试。
- 实际App模拟UI完整点击：先发布2-2，整集确认后注入保存拒绝，旧receipt退休；采用云端保留失败本地历史，整集2场发布完成，之后全部已核实3场重复发布不再发API请求。最终pending=false、version3、本地备份true，页面异常0。没有调用付费生成或代用户发布真实项目。
- 正式v2.8.30、两仓库main清单Contents API/提交原始文件交叉核验一致；公开整包下载103591293字节，SHA256 `46e2ba8ff874b5f3b9a8651da521dc01f7ce6d122fe50bf259455353985cacf9` 与本机/asset digest一致，Ed25519公开清单签名通过。
- 官方备用源全量大小/哈希及客户端固定证书签名、65536字节Range校验通过；未重复整包断点续传测试。

[公开安装包](https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.30/Xingzhou-Film-Tencent-Setup-2.8.30.exe)。
