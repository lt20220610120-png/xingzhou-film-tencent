#!/usr/bin/env bash
# 为行舟影视腾讯云版启用 HTTPS。用法：sudo bash enable-https.sh <主域名> [附加域名...]
set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then echo '用法: sudo bash enable-https.sh <域名> [附加域名...]' >&2; exit 1; fi
shift || true
EXTRA=("$@")

echo '==> 校验域名解析指向本机'
LOCAL_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)"
for d in "$DOMAIN" "${EXTRA[@]:-}"; do
  [ -z "$d" ] && continue
  R="$(getent hosts "$d" | awk '{print $1}' | head -1 || true)"
  if [ -z "$R" ]; then echo "域名 $d 无解析记录，请先添加 A 记录" >&2; exit 1; fi
  echo "  $d -> $R (本机内网 $LOCAL_IP)"
done

echo '==> 安装 certbot'
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq certbot python3-certbot-nginx

echo '==> 写入绑定域名的 Nginx 站点'
NAMES="$DOMAIN"
for d in "${EXTRA[@]:-}"; do [ -n "$d" ] && NAMES="$NAMES $d"; done
cat >/etc/nginx/sites-available/xingzhou-api.conf <<NGINX
server {
  listen 80 default_server;
  server_name $NAMES;
  client_max_body_size 200m;
  root /var/www/xingzhou;
  location /api/ {
    proxy_pass http://127.0.0.1:4310;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
  location /healthz { proxy_pass http://127.0.0.1:4310/healthz; }
  location / { try_files \$uri \$uri/ /index.html; }
}
NGINX
ln -sf /etc/nginx/sites-available/xingzhou-api.conf /etc/nginx/sites-enabled/xingzhou-api.conf
nginx -t && systemctl reload nginx

echo '==> 申请证书并开启 HTTP 跳转 HTTPS'
CERT_ARGS=(--nginx -d "$DOMAIN")
for d in "${EXTRA[@]:-}"; do [ -n "$d" ] && CERT_ARGS+=(-d "$d"); done
certbot "${CERT_ARGS[@]}" --non-interactive --agree-tos --register-unsafely-without-email --redirect

echo '==> 校验自动续期'
certbot renew --dry-run 2>&1 | tail -5

echo '==> 验证 HTTPS'
curl -fsS "https://$DOMAIN/healthz" && echo ''
echo "完成: https://$DOMAIN"
