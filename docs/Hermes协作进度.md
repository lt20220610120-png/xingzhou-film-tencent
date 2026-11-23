# Hermes 协作进度档案

Codex 默认直接在 `D:/AI/Qwen3-TTS/xingzhou-release` 开发。Hermes 只在用户明确要求后接手。开始时阅读[开发交接手册](开发交接手册.md)，核对实际 Git、测试与公开渠道。完成重要阶段后在本页写当前进展和未核实事项。

## 当前进展

2.8.200 已正式发布。LibTV 按需选路，支持系统代理、直连、自定义和 SOCKS5。连接测试和脱敏诊断已验证，分镜预检失败仅显示提示。正式安装包与 199 → 200 软件内更新下载已核验。

## 最近已发布版本

- **2.8.200，2026-11-23。** LibTV 本机网络模式、SOCKS5、连接诊断和准备阶段反馈通过隔离验证。正式 NSIS、三份签名清单与 199 → 200 更新下载通过。实现 `71322bc`，Release 455106129。[验收](release-verification-2.8.200.md)
- **2.8.199，2026-11-23。** LibTV 多素材恢复上传和可读诊断，分镜增删保位、切场回顶、视频池一次性定位。真实 Electron、正式 NSIS、三份签名清单及 198 → 199 更新下载均通过。实现 `5885ede`，Release 454973543。[验收](archive/verification/release-verification-2.8.199.md)
- **2.8.198，2026-11-23。** 修复 Windows 历史目录加密凭据兼容，新增激活页已有账号登录。真实 Electron 复现断档并验证原设备身份，正式 NSIS、三份签名清单和 197 → 198 更新下载通过。实现 `e24ae72`，Release 454679579。[验收](archive/verification/release-verification-2.8.198.md)
- **2.8.197，2026-11-23。** 退役豆包入口、旧页面、废弃部署和单次验证，旧项目可读。分集与采用图规则共用。历史按版本归档。完整备份后部署后端，正式 NSIS、三清单和 196 → 197 更新通过。实现 `023544d`，Release 454658607。[验收](archive/verification/release-verification-2.8.197.md)
- **2.8.196，2026-11-23。** 统一控件、下拉与确认弹窗，后台轮询按可见性暂停，隔离编辑和制作进度更新，首段审计去重。验证 Windows 正式载荷及 195 → 196 更新。实现 `e900e68`，Release 454639873。[验收](archive/verification/release-verification-2.8.196.md)
- **2.8.195，2026-11-23。** 导演使用最新可用规则并保留既有绑定，修复音色、提交、素材及持久化，完善云媒体授权和索引。验证隔离 PostgreSQL、Electron 与 194 → 195 更新。实现 `fa91446`，Release 454605147。[验收](archive/verification/release-verification-2.8.195.md)
- **2.8.194，2026-11-23。** 项目图音缓存、COS 内网小件中转、轻量外发参考及五版留存。验证云端健康、隔离 COS 内网读取和 193 → 194 更新。实现 `31149c7`，Release 454579102。[验收](archive/verification/release-verification-2.8.194.md)

逐版本记录与历史交接原件见[历史发布档案](archive/README.md)。
