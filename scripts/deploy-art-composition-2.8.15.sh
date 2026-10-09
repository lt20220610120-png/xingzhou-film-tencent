#!/usr/bin/env bash
# Run on the existing host after staging src/test/migrations beside this script.
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-art-composition-v2815-stage
backup=/opt/xingzhou-backups/art-composition-2.8.15-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/collab.cjs" | cut -d' ' -f1)" = cb489d8056349b7e379ec54145dbb011d78706b9dfc6752218bcf7482bfd9d7c
test "$(sha256sum "$live/src/repository-extras.cjs" | cut -d' ' -f1)" = bf9dc6875a957fbb56c6e27fd9b03bd85e047ab57fae15b4921d58ac96af1d5a
test ! -e "$live/src/image-composition.cjs"
for file in collab.cjs repository-extras.cjs image-composition.cjs; do node --check "$stage/src/$file"; done
node "$stage/test/art-composition-pg-smoke.cjs" "$stage/src"
mkdir -p "$backup"
cp -a "$live/src/collab.cjs" "$live/src/repository-extras.cjs" "$backup/"
rollback(){
 cp -a "$backup/collab.cjs" "$backup/repository-extras.cjs" "$live/src/"
 rm -f /opt/xingzhou-cloud-backend/src/image-composition.cjs
 # Leave the additive, backwards-compatible column intact; never drop user data.
 systemctl restart xingzhou-cloud-backend
 echo "ROLLBACK backup=$backup" >&2
}
trap rollback ERR
node "$stage/migrations/apply-image-composition.cjs" --admin
for file in collab.cjs repository-extras.cjs image-composition.cjs; do
 install -m 644 "$stage/src/$file" "$live/src/$file"
done
systemctl restart xingzhou-cloud-backend
healthy=false
for attempt in $(seq 1 15); do
 if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi
 sleep 1
done
test "$healthy" = true
node "$stage/test/art-composition-pg-smoke.cjs" "$live/src"
node "$stage/test/cloud-recycle-pg-smoke.cjs" "$live/src"
systemctl is-active xingzhou-cloud-backend xingzhou-purge.timer
sha256sum "$live/src/collab.cjs" "$live/src/repository-extras.cjs" "$live/src/image-composition.cjs"
trap - ERR
echo "ART_COMPOSITION_DEPLOYED_2.8.15 backup=$backup"
