#!/usr/bin/env bash
# 为行舟影视腾讯云版启用 HTTPS。
# 用法（在服务器上执行）：sudo bash enable-https.sh your-domain.com
set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "用法: sudo bash enable-https.sh <域名>" >&2
  exit 1
fi

echo "==> 检查域名解析是否已指向本机"
SERVER_IP="$(curl -fsS https://api.ipify.org || echo unknown)"
RESOLVED="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
if [ -z "$RESOLVED" ]; then
  echo "域名 $DOMAIN 还没有解析记录，请先在域名控制台添加 A 记录指向 $SERVER_IP" >&2
  exit 1
fi
if [ "$RESOLVED" != "$SERVER_IP" ]; then
  echo "域名 $DOMAIN 解析到 $RESOLVED，但本机是 $SERVER_IP；请先更正 A 记录并等待解析生效" >&2
  exit 1
fi
echo "解析正确：$DOMAIN -> $SERVER_IP"

echo "==> 安装 certbot"
apt-get update -qq
apt-get install -y -qq certbot python3-certbot-nginx

echo "==> 将 Nginx 站点绑定到域名"
cat >/etc/nginx/sites-available/xingzhou-api.conf <<NGINX
server {
  listen 80 default_server;
  server_name ${DOMAIN};
  client_max_body_size 200m;
  root /var/www/xingzhou;
  location /api/ {
    proxy_pass http://127.0.0.1:4310;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
  location /healthz {
    proxy_pass http://127.0.0.1:4310/healthz;
  }
  location / { try_files \$uri \$uri/ /index.html; }
}
NGINX
nginx -t && systemctl reload nginx

echo "==> 申请并安装证书（自动配置 HTTP 跳转 HTTPS）"
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect

echo "==> 校验自动续期"
systemctl list-timers 'certbot*' --no-pager || true
certbot renew --dry-run

echo "==> 验证 HTTPS"
curl -fsS "https://${DOMAIN}/healthz" && echo ""
echo "完成：https://${DOMAIN}"
echo "接下来请把客户端 cloud-config.public.cjs 改为 https://${DOMAIN} 并重新发布安装包。"
