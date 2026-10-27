# 2.8.83 发布验收

日期：2026-10-27。基线 2.8.82。来源：用户要求允许人工判断提示词缺项是否需要参考图，并以批量方式处理缺项。

## 实现

- `skipPromptNeed` 将人工确认的单次缺项保存为锁定的 `visibility: excluded`，保留原因和 `skipReference` 标记；`promptReviewState` 只把仍为 visible 且没有卡片的缺项列入 `pendingMissing`。
- 清单核实提示词模式新增“提示词待处理”汇总面板，列出当前分集所有提示词的缺项，提供“确认无需参考图”和“返回场景补充”两个明确动作。
- 本条提示词面板同步提供快速跳过入口。跳过后关联决策已完成，但一键核实/发布仍由原有人工批量审计记录控制。

## 验证

- `npm test` / `npm run dist`：**2453/2453** 全量测试通过。
- 新增回归：模型返回基础设定缺项时先阻塞；人工跳过后 `pendingMissing` 清零，场景批量核实并发布成功。
- `node scripts/verify-model-pipeline-ui.cjs`：1280、1700、2232 三种宽度通过；模型实际最大并发 6；工具栏单行；信息读取停止不取消下游分发；场/集/剧发布、图视提示词关联通过。
- 安装包运行时 smoke：`qa/packaged-smoke-2.8.83-1793060249801`，PASS。
- 最终安装包：103853520 字节；SHA256 `9cf39eb6e7a2513d9e5405dfcb44665f5bffaedb1079b998d3df3578c1c37c6f`。

## 公开发布复核

- 官方镜像已发布：`https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.83.exe`。
- GitHub Release `v2.8.83` 已创建并上传安装包；GitHub asset digest 与本地 SHA256 一致。
- updates 仓库、tencent 仓库和官方镜像的 `latest.json` 完全一致，签名校验通过；官方镜像 65536 字节 Range 下载返回 206，Content-Range 与总长一致。
- 复核脚本输出：`output/verify-release-2883.py`，结果 `passed: true`。

## 发布地址

- https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.83.exe
- https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.83/Xingzhou-Film-Tencent-Setup-2.8.83.exe

