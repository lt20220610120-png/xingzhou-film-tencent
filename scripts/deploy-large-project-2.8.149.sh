#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-large-project-v28149-stage
backup=/opt/xingzhou-backups/large-project-2.8.149-$(date -u +%Y%m%dT%H%M%SZ)
node --check "$stage/src/server.cjs"
mkdir -p "$backup"
chmod 700 "$backup"
cp -a "$live/src/server.cjs" "$backup/server.cjs"
rollback(){
 trap - ERR
 cp -a "$backup/server.cjs" "$live/src/server.cjs"
 systemctl restart xingzhou-cloud-backend
 echo "LARGE_PROJECT_ROLLBACK backup=$backup" >&2
}
trap rollback ERR
install -m 644 "$stage/src/server.cjs" "$live/src/server.cjs"
systemctl restart xingzhou-cloud-backend
healthy=false
for attempt in $(seq 1 15); do
 if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi
 sleep 1
done
test "$healthy" = true
XINGZHOU_TEST_SERVER_MODULE="$live/src/server.cjs" NODE_PATH="$live/node_modules" node --test "$stage/test/server-large-payload.test.cjs"
systemctl is-active xingzhou-cloud-backend
sha256sum "$live/src/server.cjs"
trap - ERR
echo "LARGE_PROJECT_DEPLOYED_2.8.149 backup=$backup"
