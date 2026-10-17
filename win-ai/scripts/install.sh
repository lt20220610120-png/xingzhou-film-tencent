#!/usr/bin/env bash
set -euo pipefail
umask 027
stage=${1:?stage directory required}
test "$(id -u)" = 0
test "$(realpath "$stage")" = /home/ubuntu/win-ai-stage-0.1.0
version=v1.0.0-rc.45
root=/opt/win-ai
expected=0eb9bcda72b25f840226d2493f2ef1074471fa511298213bca89672add7ceee9
install -d -m 755 "$root" "$root/bin" "$root/public" "$root/source" /etc/win-ai
if ! id win-ai >/dev/null 2>&1; then useradd --system --home-dir /var/lib/win-ai --shell /usr/sbin/nologin win-ai; fi
install -d -o win-ai -g win-ai -m 750 /var/lib/win-ai /var/log/win-ai
if test -f "$stage/new-api-$version"; then
  test "$(sha256sum "$stage/new-api-$version" | cut -d' ' -f1)" = "$expected"
  install -m 755 "$stage/new-api-$version" "$root/bin/new-api-$version"
elif ! test -f "$root/bin/new-api-$version"; then
  curl --fail --location --retry 3 --max-time 300 "https://github.com/QuantumNous/new-api/releases/download/$version/new-api-$version" -o "$root/bin/new-api-$version.download"
  curl --fail --location --retry 3 --max-time 90 "https://github.com/QuantumNous/new-api/releases/download/$version/checksums-linux.txt" -o "$root/bin/checksums-linux.txt"
  official=$(awk -v name="new-api-$version" '$2==name || $2=="*"name {print $1}' "$root/bin/checksums-linux.txt")
  test "$official" = "$expected"
  test "$(sha256sum "$root/bin/new-api-$version.download" | cut -d' ' -f1)" = "$expected"
  chmod 755 "$root/bin/new-api-$version.download"
  mv "$root/bin/new-api-$version.download" "$root/bin/new-api-$version"
fi
test "$(sha256sum "$root/bin/new-api-$version" | cut -d' ' -f1)" = "$expected"
install -m 644 "$stage/public/"* "$root/public/"
install -m 644 "$stage/source/"* "$root/source/"
install -d -m 755 "$root/scripts"
install -m 755 "$stage/scripts/guard-port.sh" "$root/scripts/guard-port.sh"
cat > /etc/systemd/system/win-ai-port-guard.service <<'UNIT'
[Unit]
Description=Restrict Win AI backend port to loopback traffic
Before=win-ai.service
[Service]
Type=oneshot
ExecStart=/opt/win-ai/scripts/guard-port.sh
RemainAfterExit=yes
UNIT
if ! test -f /etc/win-ai/service.env; then
  python3 - <<'PY'
import pathlib,secrets,os
p=pathlib.Path('/etc/win-ai/service.env')
p.write_text('PORT=8317\nSQLITE_PATH=/var/lib/win-ai/gateway.db\nSESSION_SECRET='+secrets.token_hex(32)+'\nCRYPTO_SECRET='+secrets.token_hex(32)+'\nSESSION_COOKIE_SECURE=true\nSESSION_COOKIE_TRUSTED_URL=https://winai.xingzhoufilm.cn\nDEFAULT_LANGUAGE=zh\nNODE_NAME=win-ai-main\nGIN_MODE=release\n')
os.chmod(p,0o600)
PY
fi
install -m 644 "$stage/win-ai.service" /etc/systemd/system/win-ai.service
systemctl daemon-reload
systemctl enable --now win-ai
for i in $(seq 1 45); do
  if curl --fail --silent http://127.0.0.1:8317/api/setup >/dev/null; then break; fi
  sleep 1
done
curl --fail --silent http://127.0.0.1:8317/api/setup >/dev/null
python3 "$stage/scripts/configure.py"
python3 "$stage/test/live-smoke.py"
python3 "$stage/scripts/ensure-dns.py"
echo 'SERVICE_CONFIGURED'
