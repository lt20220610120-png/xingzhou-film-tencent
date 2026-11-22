# Win AI Browser Login Implementation Plan

> For agentic workers: use superpowers:executing-plans, directly in this existing codex branch under workspace authorization; final independent review.

**Goal:** 独立浏览器注册、登录、找回及退出，与软件共享 UUID 及账本。
**Architecture:** 服务器封装已有 auth，原子创建无影视权限账号，通过现有 OAuth 开通原生普通用户。仅 HttpOnly 身份 Cookie。
**Tech Stack:** Node HTTP、PostgreSQL、原生 New API、静态 HTML/JS、Nginx。
**Spec:** ../specs/2026-10-18-win-ai-browser-design.md

## Global Constraints
- 品牌 Win AI；不改上游、价格、余额、真实收款配置和客户端2.8.47。
- 原生管理入口保留；无角色的公开注册不得取得影视工作权限。
- 不以代理测试代替公网；备案待官方实际查询。

## Review Focus
- CSRF/登录劫持、凭据泄漏、超大/畸形输入、暴力尝试与发信滥用。
- 并发注册验证码一次性消费、重复邮箱不覆盖。
- 源账号停用/退出、跨账号账本、零权限默认。
- 普通登录页与站长原生登录分离后路由可用。
- 新网页失败不影响既有软件身份交接。

### Task 1: Web auth and privilege boundary
- [x] RED: web auth HTTP integration tests for login/cookie/logout, signup no roles, bad Origin/body, rate limits, recovery, roleless gateway denial.
- [x] GREEN: cloud-backend/src/win-ai-web-auth.cjs, repository atomic signup and revoke, identity.forSession/signout, server wiring.
- [x] Verify targeted tests and real PG temporary schema signup transaction.

### Task 2: Browser UI and deploy
- [x] Add login/register/recovery static pages with existing brand assets, links and loading/errors; never store secrets.
- [x] Nginx routes public login and preserves admin via query flag; update admin helper, deploy/package module lists.
- [x] Real Chrome UI checks, temporary-user production auth/ledger tests and cleanup, existing embedded tests unchanged.

### Task 3: Review and publication
- [x] Full tests/build, fresh review and fixes; source commit, site0.3.0 source archive and deployment/hash validation.
- [x] Docs state verified features and external connection/ICP limits. No desktop release unless client files change.

## Execution ledger
- Baseline: 1b5cfd2, clean tracked files, existing codex/win-ai-unified-login-2.8.46 branch. Preserve output/ and unrelated security-rating doc. Existing npm dependencies reused.
- Read-only verification: direct Windows curl .cn TLS fails; server-local HTTPS200; web tool cannot access domain. Tencent ICP console redirects login, MIIT no result. No evidence of current ICP status.
- Ruling: existing feature branch reused under workspace direct-execution preference; no extra worktree or second installation.

- 后续用户反馈ICP备案申请已提交待审核；另授权客户端修复2.8.48，覆盖原“客户端无改动”范围约束。管理入口不出现在用户UI。

- 完成独立复核、浏览器真实注册/退出/再登录及清理。后续真实管理页查看任务与模型定价通过，频繁刷新触发原生20分钟限流；未修改生产限制。客户端中文UA根因见client-repair spec；最终全量2215+安装运行时Win AI模拟交接通过。
