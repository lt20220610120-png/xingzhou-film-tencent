# 2.8.57-private.3 验收记录

2026-10-21。用户在 private.2 的原编辑模式截图反馈：人物的“参考@”未补编号，图片已导入；赶项目不想跑整本，需要 AI 仅关联当前条目。

## 根因和修正

- private.2 把旧导出文件的任意连字符后缀限定为短妆造白名单，漏掉定制西装、考务监督职业装和角色说明。恢复 name-description 兼容；明确 category 仍作类型限制，常见所有者道具后缀仍禁止匹配人物。这是旧模式名称规则，不能保证识别任意无类别道具。
- 缓存签名没有算法版本迁移，既有错误空引用会被当成已处理。升级为 basic-v2；若旧签名相同且存在空“参考@”，重新匹配一次。无空引用的旧条目只迁移签名，保留主动删除的标记。人工排除图片不变，用户主动“重新匹配素材”的既有行为不变。
- runImportedAuto 增加 targetEntryId，先校验目标存在，再只请求该场景身份与该条关联；身份输入中的提示词也限制为当前条。其他条目的决定不写入，未知目标不回退整本。
- 主按钮改“AI 只关联当前条目（编号）”，整本为次按钮。完成自动/手动流程保留原 selectedEntryId。当前项不确定时只展开该项，不因其他项已就绪而跳走。原返回、停止、有限修正、版本校验保留。

## 验证

- 修改前新增 4 项测试全部失败，复现完整妆造漏匹配、旧缓存空引用、单条范围和未知目标问题，日志 output/association-current-red.log。
- 最终相关 42/42，全量 2322/2322、0 失败，日志 output/association-current-focused.log、association-current-tests.log。
- 真实 React/Edge 1280/1700，qa/imported-art-current-ui.cjs：从第二条运行仅当前条；身份上下文仅该条；返回生成仍第二条；模拟提交图片精确；返回旧编辑可用。重建截图六个人物与场景文件命名及旧缓存，自动补齐 7 个编号，0 AI 调用，重开仍保留；无页面错误。证据 output/imported-art-current-ui.json。
- 原整本/退出/晚到结果三宽回归通过，原手动关联/看图/账号隔离双宽回归通过。
- 已查看截图 output/imported-art-current-1280.png；旧模式图片证据 output/imported-art-legacy-restored-{width}.png。全部是模拟项目，未修改或读取真实剧本正文。
- 生产构建通过，日志 output/association-current-build.log。包运行验证与最终散列在下方记录。

## 交付边界

仅本机试用，不公开推送。没有运行用户项目的 AI 或付费生成，没有关闭当前行舟影视窗口。名称规则属于旧模式启发式匹配，AI 语义正确性不承诺绝对无误。共享图片身份仍按本场保存，身份改变会使引用它的旧确认需复核，不冒用过期关联。

## 最终安装包

- NSIS、ASAR、实际 Electron 运行校验 PASS，版本 2.8.57-private.3，promptArtTrial=true，importedBindingBridge=true，errors=[]。报告 qa/packaged-smoke-2.8.57-private.3-1792570075231。
- 本机交付：C:\Users\11599\Documents\ChatGPT\行舟影视\tencent\release\2.8.57-private.3\Xingzhou-Film-Tencent-Setup-2.8.57-private.3.exe
- 103810103 字节；SHA256 634ae39f11b93c4374acea20a413f8d101980e98ac99ab23d8bf1c168034825d。
- 未上传公开 Release，未修改公共更新清单。
