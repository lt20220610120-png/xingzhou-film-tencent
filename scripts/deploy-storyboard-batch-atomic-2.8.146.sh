#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-2.8.146-stage
backup=/opt/xingzhou-backups/storyboard-atomic-2.8.146-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/storyboard-merge.cjs" | cut -d' ' -f1)" = 91e4d03a816c30c635fcc5325a1f92c77be081aa77e017b1900dc984887c6697
node --check "$stage/src/storyboard-merge.cjs"
node --test "$stage/test/"*.test.cjs
mkdir -p "$backup/src"
chmod 700 "$backup"
cp -a "$live/src/storyboard-merge.cjs" "$backup/src/"
rollback(){ trap - ERR; cp -a "$backup/src/storyboard-merge.cjs" "$live/src/"; systemctl restart xingzhou-cloud-backend; }
trap rollback ERR
install -m 644 "$stage/src/storyboard-merge.cjs" "$live/src/storyboard-merge.cjs.146-new"
mv -f "$live/src/storyboard-merge.cjs.146-new" "$live/src/storyboard-merge.cjs"
systemctl restart xingzhou-cloud-backend
healthy=false
for attempt in $(seq 1 15); do if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi; sleep 1; done
test "$healthy" = true
systemctl is-active xingzhou-cloud-backend
sha256sum "$live/src/storyboard-merge.cjs"
trap - ERR
echo "DEPLOYED_ATOMIC_146 backup=$backup"
