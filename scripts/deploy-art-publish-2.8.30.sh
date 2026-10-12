#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-art-publish-v2830-stage
backup=/opt/xingzhou-backups/art-publish-2.8.30-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/server.cjs" | cut -d' ' -f1)" = 3e161ef409e4336a864e489d2d7b663a5e9d6cd9c7a97afd32bc3d79bad9ed81
node --check "$stage/src/server.cjs"
NODE_PATH="$live/node_modules" node --test "$stage/test/server.test.cjs"
mkdir -p "$backup"
chmod 700 "$backup"
cp -a "$live/src/server.cjs" "$backup/server.cjs"
rollback(){
 trap - ERR
 cp -a "$backup/server.cjs" "$live/src/server.cjs"
 systemctl restart xingzhou-cloud-backend
 echo "ART_PUBLISH_ROLLBACK backup=$backup" >&2
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
XINGZHOU_TEST_SERVER_MODULE="$live/src/server.cjs" NODE_PATH="$live/node_modules" node --test "$stage/test/server.test.cjs"
systemctl is-active xingzhou-cloud-backend
sha256sum "$live/src/server.cjs"
trap - ERR
echo "ART_PUBLISH_DEPLOYED_2.8.30 backup=$backup"
