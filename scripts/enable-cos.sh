#!/usr/bin/env bash
# 配置腾讯云 COS 媒体存储凭据（只写入服务器环境变量，不进源码/仓库）。
# 用法（在服务器上执行，凭据从标准输入读取以避免出现在进程列表）：
#   sudo bash enable-cos.sh <bucket> <region>
# 然后按提示分两行输入 SecretId 与 SecretKey。
set -euo pipefail

BUCKET="${1:-}"
REGION="${2:-ap-guangzhou}"
ENVFILE=/opt/xingzhou-cloud-backend/.env

if [ -z "$BUCKET" ]; then
  echo "用法: sudo bash enable-cos.sh <bucket> [region]" >&2
  exit 1
fi

read -r -s -p "COS SecretId: " COS_ID; echo
read -r -s -p "COS SecretKey: " COS_KEY; echo
if [ -z "$COS_ID" ] || [ -z "$COS_KEY" ]; then
  echo "SecretId 与 SecretKey 都不能为空" >&2
  exit 1
fi

sed -i '/^COS_/d' "$ENVFILE"
{
  echo "COS_BUCKET=${BUCKET}"
  echo "COS_REGION=${REGION}"
  echo "COS_SECRET_ID=${COS_ID}"
  echo "COS_SECRET_KEY=${COS_KEY}"
} >>"$ENVFILE"
chmod 600 "$ENVFILE"
chown ubuntu:ubuntu "$ENVFILE"
unset COS_ID COS_KEY

systemctl restart xingzhou-cloud-backend
sleep 3
systemctl is-active xingzhou-cloud-backend
curl -fsS http://127.0.0.1:4310/healthz && echo ""
echo "已配置 COS：${BUCKET} (${REGION})"
echo "配置项数量：$(grep -c '^COS_' "$ENVFILE")"
