# 2.8.169 发布验收（2026-11-15）

## 范围

接续 2.8.168（6e5cbd6）后的未提交妆造归并工作。接手时 package 为169，公开版本仍168；上一轮3110项、UI与包验证通过，但用户随后明确妆造是剧本中的服饰转变或可见身体转变，不包含单纯累了、疲倦。用户已完成《家庭文》关联，本轮没有改写、重新关联或重新分析该项目。

## 实现与复核

- 内置美术清单 v5.1 及全部附件同步到 JSON 包。按实际换衣、身体变化判断，不因换场、动作、情绪或疲倦扩张妆造；根据剧本保留伤后淤青、擦伤、包扎等可见差异。
- 删除旧的“轻微擦伤一律过滤”规则。角色级别、伤势轻重、只出现一次不能替代剧本判断；无依据自动换装仍过滤。
- 新分析仅对明确对应同一命名套装的临时状态归并；不识别的形态保守保留，没有数量硬上限。合并保留集数和场次，逐场引用同步改为保留名称，保存发布使用一致清单。
- 已有图片、人工确认或手工定妆提示词保留；新增回包命中已定稿同名卡时也不归并。历史原始输出、项目存储和已发布关联不进行批量清理。
- 独立阶段源码复核发现第二次发布解析也须传入现有资产，已修正，防止先保留已定稿卡又在最终序列化时误合并。

## 验证

- 最终全量3112/3112通过，0失败；Vite build通过（既有大chunk提示）。前轮3110不能作为本轮补充修改的最终验收。
- 回归覆盖累了/疲倦/疲劳/劳累/困倦、实际换衣、战后淤青、轻微擦伤、细小伤口、浅表划伤、红肿、包扎、兽化、未知形态、已有定稿保护、跨集复用、逐场对应及保存发布。
- 隔离Electron加载实际ArtSection，1280/1920宽检查：只显示日常西装、受伤破烂、战后淤青、婚礼礼服4张，疲倦/守夜/惊醒/动作卡不再出现。模拟数据，0付费请求。
- JSON bundle与9份内置Skill源文件一致性通过，全部分析入口发送同一完整包。通用skill-creator quick_validate因本机缺少PyYAML未执行成功；没有把该项记录为通过，项目自身bundle/入口回归通过。

## 发布

- 实现15b023b已推送到codex/character-voice-workflow。
- 最终NSIS实际运行PASS：qa/packaged-smoke-2.8.169-1794736677787；6份关键ASAR模块与源码逐字节一致，包含新规则和内置Skill。
- 安装包104126999字节；SHA256 `8608abc6ea0d47f0ceeb0a7a8be1ef2fc276809ddc301fcc1959faee23fb750f`。
- GitHub Release 445957862；上传工作流43701992270成功，资产uploaded/digest匹配。
- 本机直传大文件未完成后停止该上传，使用既有blockmap增量流程（4376725字节），本地/官网服务器/GitHub均还原并校验同一完整安装包。没有重新构建另一个发布包。
- 三份公开latest.json内容与Ed25519签名一致；官网Range 206首64KiB与本地相同，服务器完整SHA256一致；客户端固定证书IP源返回169。
- 隔离真实更新弹窗2.8.154→2.8.169：只检测一次、实际续传最后64KiB、整包校验、安装回调通过。安装回调为测试替身，未替用户安装或重启正式客户端。
- 官网 https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.169.exe
- GitHub https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.169/Xingzhou-Film-Tencent-Setup-2.8.169.exe
- 本机 D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.169/Xingzhou-Film-Tencent-Setup-2.8.169.exe

运行证据：output/169-final-tests.log、169-final-build.log、169-ui.json、169-ui-1280.png、169-ui-1920.png、169-final-package.log。纯客户端更新，无云端业务或数据库部署，无真实项目写入，无收费生成。

发布证据：output/169-artifact.json、169-stage.log、169-workflow-run.log、169-publish-final.log、169-public.json、169-update-ui.json。
