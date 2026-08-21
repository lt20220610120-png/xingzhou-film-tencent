#!/usr/bin/env bash
# certbot DNS-01 钩子：用腾讯云 DNSPod API 自动写入/清理 _acme-challenge TXT 记录。
# 凭据从 /opt/xingzhou-cloud-backend/.env 读取（COS_SECRET_ID / COS_SECRET_KEY）。
# 用法（由 certbot 调用）：
#   --manual-auth-hook   /opt/xingzhou-cloud-backend/certbot-dnspod-hook.sh add
#   --manual-cleanup-hook /opt/xingzhou-cloud-backend/certbot-dnspod-hook.sh clean
set -euo pipefail
MODE="${1:-add}"
ENVFILE=/opt/xingzhou-cloud-backend/.env
ROOT_DOMAIN=xingzhoufilm.cn

SECRET_ID="$(grep -E '^COS_SECRET_ID=' "$ENVFILE" | cut -d= -f2-)"
SECRET_KEY="$(grep -E '^COS_SECRET_KEY=' "$ENVFILE" | cut -d= -f2-)"
export SECRET_ID SECRET_KEY ROOT_DOMAIN MODE
export CERTBOT_DOMAIN="${CERTBOT_DOMAIN:-$ROOT_DOMAIN}"
export CERTBOT_VALIDATION="${CERTBOT_VALIDATION:-}"

node /opt/xingzhou-cloud-backend/dnspod-hook.cjs
# DNS 传播等待：新增后给全球解析器留时间
if [ "$MODE" = 'add' ]; then sleep 150; fi
