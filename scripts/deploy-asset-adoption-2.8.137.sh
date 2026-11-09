#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-assets-2.8.137-stage
backup=/opt/xingzhou-backups/asset-adoption-2.8.137-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/collab.cjs" | cut -d' ' -f1)" = 92fea4d31663ecdda49171e58a3a0a242182e2b361d2ee4965c7f8ff8803badf
test "$(sha256sum "$live/src/repository-extras.cjs" | cut -d' ' -f1)" = 6c777f6784ec46a243520e80cceec637d627ee9a46bed81f67f7af2c9d22c984
node --check "$stage/src/collab.cjs"
node --check "$stage/src/repository-extras.cjs"
node --test "$stage/test/asset-update.test.cjs" "$stage/test/asset-adoption137.test.cjs"
mkdir -p "$backup/src"
chmod 700 "$backup"
cp -a "$live/src/collab.cjs" "$live/src/repository-extras.cjs" "$backup/src/"
rollback(){ trap - ERR; cp -a "$backup/src/collab.cjs" "$backup/src/repository-extras.cjs" "$live/src/"; systemctl restart xingzhou-cloud-backend; echo "ADOPTION_ROLLED_BACK $backup" >&2; }
trap rollback ERR
install -m 644 "$stage/src/collab.cjs" "$live/src/collab.cjs"
install -m 644 "$stage/src/repository-extras.cjs" "$live/src/repository-extras.cjs"
systemctl restart xingzhou-cloud-backend
healthy=false
for attempt in $(seq 1 15); do if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi; sleep 1; done
test "$healthy" = true
systemctl is-active xingzhou-cloud-backend
sha256sum "$live/src/collab.cjs" "$live/src/repository-extras.cjs"
trap - ERR
echo "ASSET_ADOPTION_DEPLOYED backup=$backup"
