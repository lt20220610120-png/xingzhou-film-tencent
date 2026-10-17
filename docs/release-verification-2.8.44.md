# 2.8.44 验收记录

日期：2026-10-17。基线e38fd04（2.8.43），分支codex/compact-art-scenes-2.8.44。保留未跟踪docs/security-rating-2.8.4.md与output/。按用户明确反馈仅修改界面，不调用付费生成，不修改真实项目数据或部署云端。

## 修改与原因

- 信息读取移除scriptContext/background整段展示及其专用样式；删除界面专用指纹计算，不改变artScriptContext、连续分析器、本地检查点、genre同步和下游前提传递。原后台分析继续。
- 原AssetIdentity直接展开sceneIds；人物组左栏contain:size固定由编辑区高度决定，非妆造子元素又flex-shrink:0，长场次表耗尽高度导致底部妆造导航几乎不可见。改成共享AssetSceneLinks入口，仅“对应场景”常驻，美术及资产均生效。
- 浮层portal到document.body，避免身份栏contain/祖先overflow裁切；限制视口宽高、重定位并内部滚动。hover延迟移出关闭，click固定/再次点击或外部点击关闭，Escape关闭；按资产ID重建状态以在切换妆造后收起。不新增数据写入。
- 独立复核发现键盘初版不能自然进入长场景列表，已补ArrowDown/键盘激活聚焦可滚动列表，Escape回焦；补真实键盘PageDown回归。

## 验证

- scripts/verify-compact-art-scenes-ui.cjs使用完整生产React构建和独立API/项目fixture：480个场次号、同角色7套妆造；信息读取不显示背景但genre原值不变；hover打开并内部滚动至末项，移出关闭；点击固定、Escape关闭；ArrowDown进入列表、PageDown滚动、Escape回焦。
- 七套妆造均可滚动点击，编辑区切换到对应内容，切换后浮层关闭。1120、1280、1600、2048px浮层在视口内，无横向溢出；无pageerror、无资产写入或生成调用。证据output/playwright/compact-art-scenes-2.8.44/。
- 上版全文自动分析、持续修复、生物模式和快速发布流程界面脚本适配隐藏背景展示，继续验证后台分段缓存与云genre保存。
- 最终npm test通过2191/2191（133.2秒，output/tests-2844-final.log），npm run build通过；旧界面source contract按用户新要求由“存在背景展示”改为“不展示”，其他分析流程断言保留。
- 上版真实React回归通过：全文背景分段缓存与genre保存、停止重试、3集自动修复完成、生物单张/批量构图、全部核实发布→美术显示。证据output/playwright/art-analysis-2.8.44/。
- 独立最终复核通过，真实Edge验证Enter/ArrowDown进入列表、PageDown滚动、Escape回焦、第七套妆造切换收起与无资产写入；未发现重要遗留。
- 安装包与公开更新验证完成后补录。
