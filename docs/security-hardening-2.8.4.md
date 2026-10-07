# 行舟影视 2.8.4 安全加固验收

对应此前安全复核报告，已完成客户端修改及后端部署。稿件继续保存本地，本地编辑、导入、导出不要求额外联网认证。

已发布：[行舟影视 2.8.4](https://github.com/lt20220610120-png/xingzhou-film-updates/releases/tag/v2.8.4)。软件内“设置 → 检查更新”可以获取本版本。

公开更新验证：两个仓库的 `latest.json` 内容一致，客户端实际检查入口通过固定公钥签名验证；版本 2.8.4、大小 102709978 字节、SHA256 `978dab893ed9b2c65a600ec044105297bd66a7f3db74a06302628e6b09b0ea3c` 与本地安装器及 GitHub 资产摘要一致。验证记录保存在 `qa/security-284-public-release.json`。

## 已完成

- **更新信任链**：固定官方清单源；客户端固定 Ed25519 公钥；发布清单签名覆盖版本、下载地址、说明、大小、SHA256、发布时间。下载前重新获取可信清单，拒绝相同或更旧版本；只允许官方发布资产及指定 GitHub HTTPS 跳转。下载后与执行前都核对实际文件，拒绝裸 asar 替换；下载临时文件使用随机名称和独占创建。
- **桌面入口**：所有 IPC 注册经过统一的主窗口、主 frame 与页面地址检查。联网生成验证服务端账号；账号切换期间拒绝新生成，退出或发现凭证失效时中止保护请求。生成参数限制类型、协议和数量，禁止将可执行链接协议交给系统。
- **页面保护**：主页面启用生产 CSP、沙箱、导航和新窗口限制，关闭生产调试入口。随包画布仍可内嵌，画布 frame 没有主工作区桥接权限。
- **本地凭证**：使用 Electron safeStorage / Windows DPAPI 加密整个会话记录，旧明文会话自动迁移；系统加密不可用时不静默写明文；短暂网络故障不会删除已有会话或稿件。协作服务统一从受保护的凭证存储读取 Token。
- **服务端会话**：封禁账号无法恢复登录；封禁与撤销全部会话同事务完成。找回密码、消费验证码、撤销会话同事务完成；密码重置期间的旧密码登录不能再发出 Token。恢复操作检查验证码是否仍有效，防止并发重复消费。
- **发布包**：不再包含未使用的本地邀请码登录模块；启用 ASAR 完整性与仅加载 ASAR 的 fuses，关闭 RunAsNode、Node 环境选项与 CLI 调试注入。

## 验证

- 完整测试：1747 项通过，0 失败；生产构建通过。
- 更新攻击测试：篡改签名字段、错误发布密钥、非官方来源、错误大小/摘要、过长文件、下载后篡改、恶意跳转被拒绝。
- IPC 测试：其他窗口、子 frame、远程页面、伪造账号、封禁账号和身份切换竞态被拒绝；离线稿件保存保持可用。
- 真实 Windows 安装包运行：系统加密及旧凭证迁移、未登录生成拦截、CSP、沙箱、调试入口关闭、DOCX 导入导出、本地媒体预览、内嵌画布加载均通过。
- 实际复制发布包后修改 ASAR 中一个字节，复制包启动失败，报告 `ASAR Integrity Violation: got a hash mismatch`；原始发布包未改动。
- 后端部署前后均在真实 PostgreSQL 上用临时表和最终回滚的事务验证改密、旧 Token 拒绝、登录竞态、封禁会话撤销。没有修改真实账号或剧本数据，没有调用付费模型。
- 服务部署到 `/opt/xingzhou-cloud-backend`，健康检查通过；部署前源码备份位于 `/opt/xingzhou-backups/security-v284-20261007T200700Z`。

本地验证日志位于 `qa/security-284-tests.log`、`qa/security-284-package.log`、`qa/security-284-backend-deploy.log`、`qa/security-284-tamper.log`。这些工作文件不随安装包分发。

## 发布密钥与剩余边界

更新清单的公钥随客户端发布，私钥存于当前发布机器的用户私有目录 `.codex/secrets/xingzhou-update-signing-private.pem`，文件 ACL 已限制为当前 Windows 用户。私钥不进入源码、安装包、日志或公开更新仓库。发布前验证私钥与固定公钥匹配；维护者须通过受保护的备份渠道保管此文件，不能随意重新生成密钥替换客户端公钥。

当前更新身份验证使用行舟独立发布签名，**安装器的 Windows Authenticode 状态仍为 NotSigned**。取得正式发布者代码签名证书后，可再配置 Windows 签名与发布者校验；本次没有采购证书，也没有用自签证书冒充受信任发布者。

DPAPI 和 ASAR 完整性不是对本机管理员或同一 Windows 用户权限下恶意进程的绝对防护；已受理的付费生成任务无法保证取消计费。本次加强的是实际权限边界、凭证存储、更新验证及篡改检测，不宣称客户端不可破解。新更新保护从 2.8.4 起生效，旧客户端需要先升级。

依据：[Electron 安全清单](https://www.electronjs.org/docs/latest/tutorial/security)、[safeStorage 保护范围](https://www.electronjs.org/docs/latest/api/safe-storage)、[ASAR 完整性验证](https://www.electronjs.org/docs/latest/tutorial/asar-integrity)。
