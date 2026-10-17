#!/usr/bin/env bash
set -euo pipefail
stage=${1:?stage directory required}
test "$(id -u)" = 0
test "$(realpath "$stage")" = /home/ubuntu/win-ai-stage-0.1.0
install -m 644 "$stage/scripts/ensure-dns.py" "$stage/scripts/cert-dns-hook.py" /opt/win-ai/scripts/
if ! test -f /etc/letsencrypt/live/winai.xingzhoufilm.cn/fullchain.pem; then
  certbot certonly --manual --preferred-challenges dns \
    --manual-auth-hook 'python3 /opt/win-ai/scripts/cert-dns-hook.py auth' \
    --manual-cleanup-hook 'python3 /opt/win-ai/scripts/cert-dns-hook.py cleanup' \
    --non-interactive --agree-tos --register-unsafely-without-email \
    --deploy-hook 'systemctl reload nginx' -d winai.xingzhoufilm.cn
fi
target=/etc/nginx/conf.d/win-ai.conf
backup=/opt/win-ai/backups/$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$backup"
if test -f "$target"; then cp -a "$target" "$backup/win-ai.conf"; fi
rollback() {
  result=$1
  trap - ERR
  if test -f "$backup/win-ai.conf"; then cp -a "$backup/win-ai.conf" "$target"; elif test -f "$target"; then unlink "$target"; fi
  if nginx -t; then systemctl reload nginx || true; fi
  echo 'Win AI publication failed; restored previous virtual-host configuration' >&2
  exit "$result"
}
trap 'rollback $?' ERR
install -m 644 "$stage/nginx.conf" "$target"
nginx -t
systemctl reload nginx
curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 1 --max-time 15 --resolve winai.xingzhoufilm.cn:443:127.0.0.1 https://winai.xingzhoufilm.cn/api/status >/dev/null
curl --fail --silent http://127.0.0.1:4310/healthz
echo ' WIN_AI_HTTPS_PUBLISHED'
trap - ERR
