# 2.8.167 发布与本机恢复验收（2026-11-14）

## 原因与更正

- 2.8.166 的 showLogin 提前返回分支引用尚未初始化的 authenticated 常量，导致用户截图中的 Cannot access 'A' before initialization。此前静态渲染和包启动验证没有覆盖点击入口；2.8.166 交接中关于该入口实际可用的表述不成立。
- 服务器只读查询：管理员原会话创建于 2026-11-07 14:54:35+08，固定到期 2026-11-14 14:54:35+08。使用期间没有续期，管理员与免卡权限仍有效。
- 2.8.165 会在目标会话缺失时反复复制九月份旧会话。该记录还属于迁移前账号 ID，不能当作当前有效云端凭据。

## 实施

移除 2.8.166 新增管理员入口及初始化崩溃，旧目录登录状态只迁移一次，云端有效会话按活动续期。

- 活动续期保留七天空闲窗口，仅对服务器仍有效、未封禁会话续期，距到期不足六天时才写入。长期未使用而已过期的会话不因客户端缓存自动恢复。
- 本机恢复是用户授权下的一次服务器管理操作：使用既有拥有者 SSH 管理权限，核验当前精确账号 ID、管理员、未封禁与免卡记录后建立可撤销会话；走正式 session/license-route 再次验证，Windows safeStorage 加密保存。没有将恢复脚本、SSH 凭据或管理员会话打入客户端，没有增加免认证入口或修改密码。
- 原本机加密记录备份为用户数据目录下 cloud-session.before-2.8.167.encrypted.json。
- 云端仅部署 postgres-repository.cjs；回滚备份 /opt/xingzhou-backups/session-renewal-2.8.167-20261114T094203Z，健康检查及服务 active。

## 实测

全量测试 3095/3095、Vite 构建、正式安装包运行通过；真实 PostgreSQL 临时表事务验证有效会话续期、重复请求不反复写入、过期/封禁/撤销不续期；三份公开清单验签、GitHub 摘要及官网 Range 206 通过。

- 在用户电脑实际静默安装 2.8.167，启动正式安装目录的 exe，Windows computer use 截图确认头像、导演工作台和云端项目加载。
- 点击项目协作后实际项目资产页面加载；没有执行付费生成或修改项目。
- 点击窗口关闭并确认进程退出，再启动正式 exe，截图确认自动进入工作台。全程无需卡密、密码输入或管理员入口。
- scripts/verify-session-renewal.cjs 为可复用的真实 PostgreSQL 回归，仅操作事务内临时影子表并最终回滚；已在服务真实数据库权限下通过。

## 发布

- Release 445186645；上传工作流成功运行 43582057368。
- 大小 104137535；SHA256 `f5bae4425765812d16d6e62a822a6667a89f67a11b1abf0b2a794d2dde5f0df5`。
- 官网 https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.167.exe
- GitHub https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.167/Xingzhou-Film-Tencent-Setup-2.8.167.exe
- 本地 D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.167/Xingzhou-Film-Tencent-Setup-2.8.167.exe
