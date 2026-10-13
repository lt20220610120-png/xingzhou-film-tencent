# 2.8.34 AutoDL H3视频接入验收

日期2026-10-13，基线2.8.33（6ac2a31）。用户指定升级画质`minimax_h3_zm_u24`及高速`minimax_h3_zm_u08`，截图提供工作流输入/输出参数。

依据[AutoDL官方ComfyUI API](https://autodl.art/docs/comfyui_api/)只读核对，原始文档留在`output/autodl-api-docs.html/txt`：原样Authorization Token，不加Bearer；POST `/api/v1/comfyui/comfyui_workflow/{workflow_id}`；GET `/api/v1/comfyui/comfyui_workflow/result/{task_id}`。官网令牌选择ComfyUI分组。QUEUED/RUNNING/SUCCESS/FAILED兼容用户样例completed。结果选择视频条目，签名参数保留，下载不携带Token。

两个workflow目录由官网文档+用户截图校验的内置条目提供，不声称读取用户令牌当前所有权限，也不请求不存在的models接口。可手填其他ID，但本版预置参数契约针对这两个指定H3工作流。model ID只能含字母数字、下划线和连字符。

UI常规480p/768p与9:16/16:9/1:1合成为上游中文resolution；1–15秒整数，prompt≤20000，1–9图、≤3音频、不接受参考视频、seed可选安全整数且0保留。按类型顺序使用零起始ref_image_N、ref_audio_N，seed/ratio/模板model等无关字段不发送。

复用2.8.33的本地参考临时签名/直传/48小时清理；支持图片JPG/PNG/WebP及音频MP3/WAV/MP4/FLAC。新增云端FLAC扩展名与audio/mp4 MIME，仍限定临时前缀，业务项目不迁移不删除。密钥不进入任务历史；结果不明不自动重提，准备错误failed，实际付费POST不明uncertain。

专项先红后绿验证正确路由、Token格式、参数、输入校验、两种成功状态、预览图后的视频选择、下载不带Token、错误脱敏、零请求目录、PNG+FLAC准备以及重启原任务恢复。独立复核33/33通过，无阻塞问题。未使用用户Token或真实付费生成。

真实React隔离界面：点击AutoDL快捷接入→保存→选择升级画质→seed填0→mock提交→切高速版及16:9→再次mock提交。请求分别包含u24/u08、5秒、768p、9:16/16:9、seed0、本地image/audio；两个目录标签和ComfyUI令牌说明可见。截图`output/playwright/autodl2834-fast.png`。Browser fixture不支持xzmedia，因此本地预览请求失败，未当作Electron预览故障或素材有效性证据。

云端仅扩展COS签名及临时素材模块对FLAC/audio MP4的支持，部署前两文件哈希与2.8.33基线一致。服务器Node18测试12/12通过，备份/回滚目录`/opt/xingzhou-backups/autodl-audio-2.8.34-20261013T110108Z`；部署后健康/active通过。两份合成音频字节验证签名PUT、无登录签名GET、Content-Type与字节相符，到期删除2份测试对象成功；不声称这些存储样本代表真实音频生成质量。证据`output/autodl-2834-cloud-deploy.log`。无数据库迁移或用户项目写入。

正式`npm run dist`通过：2066/2066全量测试，0失败；Vite构建2052模块成功；NSIS安装包运行验证PASS，报告`qa/packaged-smoke-2.8.34-1791889618846`，版本2.8.34、errors为空。公开发布证据完成后追加。
