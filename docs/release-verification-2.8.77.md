# 2.8.77 发布验收

日期：2026-10-26。来源：用户最新五张截图与提示词结构说明。基线：已发布 2.8.76。

## 实现

- 场景资产卡片的“提示词”按钮显示自动分发关系，弹窗支持当前场景多条关联。`core/scenePromptAssignments.js` 读写现有版本决策，避免另存一套关系。共享资产不会串场，新旧提示词版本隔离。
- 项目协作提示词页和图视生成独立关联使用 `BindingAuditList`，按类别显示已关联的紧凑行；依据和图片折叠。上方 `SceneInventoryDisclosure` 提供本场景全部资产及“关联本条”。保留原有按整场核实/发布。
- `promptFoundation.js` 内置 Skill 明确基础设定字段、分号实体、逗号属性、多姓名并列；两种模型调用均包含结构化基础设定和完整提示词。已有实体验证、人工锁定、最多三次修正及缺项提醒保留。
- 场景模式下分发控制器继续运行；保存事件按项目及账号隔离。人工修改期间的旧 AI 回包通过修订号检查拒绝覆盖。关联仍按现有版本记录保存，不修改整场资产身份或发布签名。
- 仅已保存的有效分发、以及来源变更后保留的人工锁定可显示为已关联；未保存的规则建议不冒充关联结果。

## 验证

- 新增结构化基础设定与跨提示词关联测试：属性不拆卡、基础设定边界、跨场拒绝、取消锁定、未保存建议不展示为关联、版本隔离。
- `scripts/verify-scene-inventory-ui.cjs`：1280/1700 宽度，左右等高、无横向溢出，紧凑卡片 47–64px；默认只看已关联资产，当前条目手动补选、场景侧多提示词关联、重开保留、失败三次限制、迟到回包保留人工选择。
- `scripts/verify-binding-audit-import-ui.cjs`：1280/1700 宽度，独立导入后相同左右布局、黑色正文、折叠场景清单补选，切换提示词及最终仅提交当前提示词图片子集。
- `npm run dist`：全量 **2423/2423 通过**，Vite 生产构建、NSIS 和实际安装包运行时验证 PASS。
- 两组浏览器脚本追加加载本版完整生产 CSS 后复验通过；证据在 `output/playwright/ui-2877.json`、`output/playwright/imported-audit-2877.json` 和同目录截图。
- 独立 diff 复核覆盖：账号/项目隔离、跨场共享身份、版本隔离、来源变更、人工锁定、并发迟到回包、整场发布和图片门禁；旧版本有效关联继续沿用原签名契约。
- 安装包 `release/2.8.77/Xingzhou-Film-Tencent-Setup-2.8.77.exe`，103841830 字节；SHA256 `8c907a87482c21ef0b65ddc84d2a9f70ba6e4a322564aed705d2e9155087cb50`。
- 已正式发布：GitHub 更新仓库 main 清单、源码仓库 main 清单、xingzhoufilm.cn 官方清单均为 2.8.77，URL、大小、SHA256 和 Ed25519 签名核验一致。
- 官方安装包 Range 请求返回 206，Content-Range 为 bytes 0-1023/103841830，文件头 MZ；GitHub 安装包 HEAD 返回 200，大小一致。公开验证证据 `output/playwright/public-release-2877.json`。
- 源码提交 `33fc950`；公开包：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.77/Xingzhou-Film-Tencent-Setup-2.8.77.exe ，官方镜像：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.77.exe 。

## 范围

界面和 AI 调用使用模拟接口验证；未调用付费生图/视频或修改用户真实项目。保留用户已有无关 Win AI 脚本和未跟踪文件。
