# WorkBuddy Admin Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.

**Goal:** 在行舟管理后台直接管理本机 WorkBuddy 号池，复用管理员登录并支持验签更新。

**Architecture:** React 保留旧后台并新增独立页签；Electron 主进程验证云端管理员，使用独立 WebContentsView 与短期本机会话。服务适配器负责发现、启动和签发，更新器负责正式 GitHub 发布验签、备份和回滚。

**Tech Stack:** React、Electron 43、Node 内置模块、现有 Windows Python/PowerShell/OpenSSH。

**Spec:** docs/superpowers/specs/2026-10-01-workbuddy-admin.md

## Global Constraints

- 保留用户、邀请码和制片身份管理。
- 不向渲染进程返回密码、签名秘密或行舟 token。
- 仅当前未停用管理员可进入、配置和更新；上游部署永久数据必须保留。
- 发布 2.4.9 安装包并核对公开版本、大小、SHA256。

## Review Focus

- 退出与迟到权限校验并发：不能重新建立已注销会话。
- 端口被其他程序占用：不能认为是面板或停止无关程序。
- 云端不可用或权限撤销：不能继续授予面板权限。
- 伪造签名、恶意归档路径：安装前拒绝且不修改部署。
- 更新启动失败：恢复旧代码和原有账户数据。

### Task 1: 本机服务与会话适配

**Files:** electron/workbuddy-service.cjs、electron/workbuddy-service.test.cjs

**Interfaces:** createWorkBuddyService → discover/status/start/stop/selectRoot/sessionCookie；Cookie 仅主进程内部使用。

- [x] 编写并运行服务身份、部署目录、签名会话和安全失败测试。
- [x] 实现快捷方式发现与既有 Windows 原生服务生命周期。
- [x] 核对正式上游会话规范并运行针对性测试。

### Task 2: 原生更新

**Files:** electron/workbuddy-update.cjs、配套 helper 与测试

**Interfaces:** createWorkBuddyUpdater({getRoot,stop,start,onProgress}) → check/update。

- [x] 编写验签拒绝、归档路径、永久数据保留和失败回滚测试。
- [x] 下载受信发布、验证、暂存、备份、替换并恢复失败安装。
- [x] 运行针对性测试，验证真实上游发布包和兼容性。

### Task 3: 权限门禁与内嵌

**Files:** electron/workbuddy-panel.cjs、main.cjs、preload.cjs、cloud-access-service.cjs、针对性测试

**Interfaces:** workBuddyStatus/SelectRoot/Open/SetBounds/Close/CheckUpdate/Update/UpdateState。

- [x] 编写普通用户、停用管理员、退出竞态和页面销毁测试。
- [x] 实现有限 IPC、独立 session、请求授权与页面生命周期。
- [x] 修复云 session 迟到写回退出状态，运行测试。

### Task 4: 管理后台页签

**Files:** src/v06/AdminPanel.jsx、WorkBuddyPanel.jsx、src/account-access.css

- [x] 保留旧后台默认入口，新增页签及状态、更新确认与进度。
- [x] 同步原生页面边界，切换与更新时销毁承载页面。
- [x] 验证窗口内嵌、旧后台、无二次面板登录及更新反馈。

### Task 5: 验证与发布

**Files:** package.json、package-lock.json、release-notes/2.4.9.md

- [x] 审查所有改动，运行 npm test/build 和实际 Electron UI 验证。
- [x] 打包并验证运行时，提交并推送源码。
- [ ] 发布并核对公开清单和安装包 SHA256。
