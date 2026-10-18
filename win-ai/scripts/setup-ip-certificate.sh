#!/usr/bin/env bash
set -euo pipefail
stage=${1:?stage required}
test "$(id -u)" = 0
test "$(realpath "$stage")" = /home/ubuntu/xingzhou-winai-v2846-stage
install -d -m 755 /var/www/win-ai-acme
install -m 644 "$stage/win-ai/scripts/ip-http-acme.conf" /etc/nginx/conf.d/win-ai-ip-acme.conf
if ! nginx -t; then unlink /etc/nginx/conf.d/win-ai-ip-acme.conf; exit 1; fi
systemctl reload nginx
if ! test -x /opt/win-ai/certbot/bin/certbot; then
  python3 -m venv /opt/win-ai/certbot
  /opt/win-ai/certbot/bin/pip install --disable-pip-version-check 'certbot==5.4.0'
fi
install -d -m 700 /etc/win-ai/ip-tls /etc/win-ai/ip-tls/config /etc/win-ai/ip-tls/work /etc/win-ai/ip-tls/logs
/opt/win-ai/certbot/bin/certbot certonly --non-interactive --agree-tos --register-unsafely-without-email \
  --config-dir /etc/win-ai/ip-tls/config --work-dir /etc/win-ai/ip-tls/work --logs-dir /etc/win-ai/ip-tls/logs \
  --preferred-profile shortlived --webroot --webroot-path /var/www/win-ai-acme --ip-address 106.55.41.128 \
  --deploy-hook 'systemctl reload nginx'
cat > /etc/systemd/system/win-ai-ip-certificate.service <<'EOF'
[Unit]
Description=Renew public Win AI IP certificate
[Service]
Type=oneshot
ExecStart=/opt/win-ai/certbot/bin/certbot renew --non-interactive --config-dir /etc/win-ai/ip-tls/config --work-dir /etc/win-ai/ip-tls/work --logs-dir /etc/win-ai/ip-tls/logs --deploy-hook "systemctl reload nginx"
EOF
cat > /etc/systemd/system/win-ai-ip-certificate.timer <<'EOF'
[Unit]
Description=Check short-lived Win AI certificate every six hours
[Timer]
OnBootSec=10m
OnUnitActiveSec=6h
RandomizedDelaySec=15m
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now win-ai-ip-certificate.timer
echo 'Public IP certificate issued; the existing pinned client certificate is unchanged'
