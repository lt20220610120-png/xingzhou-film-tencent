#!/usr/bin/env bash
# Run on the existing host after staging backend src/test beside this script.
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-cloud-recycle-v2813-stage
backup=/opt/xingzhou-backups/cloud-recycle-2.8.13-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/collab.cjs" | cut -d' ' -f1)" = 1a226bd585ba923fe97408e37110e26029dd82ea60202469603bf35ec602c6a0
test "$(sha256sum "$live/src/repository-extras.cjs" | cut -d' ' -f1)" = 5830446b1ca38f41c7c8a69e577edde59777ab7267981c69d3b0da0f2165cec7
test ! -e "$live/src/cloud-recycle.cjs"
for file in collab.cjs repository-extras.cjs cloud-recycle.cjs; do node --check "$stage/src/$file"; done
node "$stage/test/cloud-recycle-pg-smoke.cjs" "$stage/src"
mkdir -p "$backup"
cp -a "$live/src/collab.cjs" "$live/src/repository-extras.cjs" "$backup/"
rollback(){
 cp -a "$backup/collab.cjs" "$backup/repository-extras.cjs" "$live/src/"
 rm -f /opt/xingzhou-cloud-backend/src/cloud-recycle.cjs
 systemctl restart xingzhou-cloud-backend
 echo "ROLLBACK backup=$backup" >&2
}
trap rollback ERR
for file in collab.cjs repository-extras.cjs cloud-recycle.cjs; do
 install -m 644 "$stage/src/$file" "$live/src/$file"
done
systemctl restart xingzhou-cloud-backend
healthy=false
for attempt in $(seq 1 15); do
 if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi
 sleep 1
done
test "$healthy" = true
node "$stage/test/cloud-recycle-pg-smoke.cjs" "$live/src"
systemctl is-active xingzhou-cloud-backend xingzhou-purge.timer
sha256sum "$live/src/collab.cjs" "$live/src/repository-extras.cjs" "$live/src/cloud-recycle.cjs"
trap - ERR
echo "CLOUD_RECYCLE_DEPLOYED_2.8.13 backup=$backup"
