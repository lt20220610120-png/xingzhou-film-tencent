# 美术图片构图选择 Implementation Plan

> For agentic workers: use superpowers:executing-plans inline; final independent review follows workspace AGENTS.md.

**Goal:** 画风独立于人物构图，内置原四格与用户指定的横向五格，项目默认云同步，单卡可覆盖和人工编辑。

**Architecture:** 构图模块包装现有提示词序列化及读写，不改资产描述/引用领域规则。项目新增 image_composition，默认 portrait-four；专用 art-image-settings scope 仅允许美术编辑角色修改此字段。现有项目-update、素材编辑和生成接口继续使用。

**Tech Stack:** React、现有 Electron bridge、Node、PostgreSQL。

**Spec:** 本文件的以下约束与用户本次截图/原文作为实现 brief。

## Global Constraints

- 两种构图准确内置，横向五格按用户指定的三个全身面板、两个脸颈面板、前/侧无头和背面完整头部实现；原四格不改。
- 三种画风保持原语义，3D 不变真人；群像、自由构图、场景、道具不强套单人拼图。
- 项目默认用于旧/新未自定义单人卡；明确单卡选择、手写前置、空前置均保留。切换画风及恢复默认可重新组合。
- 默认通过云端项目字段同步，保存失败不假装成功；读写受项目角色、锁定、删除态约束，新增 scope 不开放其他项目字段。
- 单张、批量、预览均使用同一组合逻辑；参考图片、妆造差异与未保存草稿保持原行为。
- 不操作实际用户项目、无付费生成；直接实现验证发布 2.8.15，遵从用户授权，不再次要求设计/发布批准。

## Review Focus

- 已保存的旧四格及手写附加前置必须区分，不能一律替换。
- 修改未保存描述和项目默认后生成，不能带旧构图或重复隐藏前置。
- 换装基准引用及差异投影不因新增元数据失效。
- artist/collaborator scope 不能越权修改剧本、题材或普通项目字段。
- 云端持久化、回收/锁定保护、旧版客户端默认兼容及数据库新增列回滚安全。

## Task 1: 构图组合与兼容

- [x] 写 core/artImageComposition.test.js：画风×构图、项目继承/单卡/人工覆盖、序列化、旧前置、引用/预览一致性；确认红。
- [x] 新 core/artImageComposition.js，仅为 buildImagePrompt 增加可选前置覆盖，不改变内容推导；确认绿。

## Task 2: 云端项目默认

- [x] 写后端作用域/权限/字段/非法值测试，确认红。
- [x] schema.sql 增加 image_composition；collab/repository 专用白名单和校验；确认绿。
- [x] 实际 PostgreSQL 临时表验证，生产新增列幂等迁移，备份源码和失败回滚。

## Task 3: 共用 UI 与生成入口

- [x] 增加项目默认控件，信息读取/美术/资产可见；共用 AssetDetail 增加单卡构图选择，保留前置编辑。
- [x] 单张、批量、预览共用包装函数，完整草稿同步及错误提示。
- [x] 真实 App 模拟 API 验证默认云保存、场景隔离、两种界面单卡/批量发送、手写前置、刷新保留及权限；大小窗口截图。

## Task 4: 验证与发布

- [x] 独立只读复核，全量 npm test/build。
- [x] 部署后端，版本/发布说明，提交源码；安装包运行时验证。
- [ ] 发布 2.8.15，完整下载、双清单、SHA256 和签名核验，记录结果。
