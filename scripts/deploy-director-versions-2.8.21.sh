#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-director-versions-v2821-stage
backup=/opt/xingzhou-backups/director-versions-2.8.21-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/collab.cjs" | cut -d' ' -f1)" = 275d2e743e8a638990ebac72d29c5351f1f72f5d57352a203306f17abe18312a
test "$(sha256sum "$live/src/repository-extras.cjs" | cut -d' ' -f1)" = 8d843451bd813ff5238a7a80b4e21406d2ec92dd6ff11e008ab436edf4b053b3
test ! -e "$live/src/director-versions.cjs"
for file in collab.cjs repository-extras.cjs director-versions.cjs migration-manifest.cjs; do node --check "$stage/src/$file"; done
node --test "$stage/test/director-versions.test.cjs"
node "$stage/test/director-versions-pg-smoke.cjs" "$stage/src"
mkdir -p "$backup"
chmod 700 "$backup"
cp -a "$live/src/collab.cjs" "$live/src/repository-extras.cjs" "$live/src/migration-manifest.cjs" "$backup/"
rollback(){
 trap - ERR
 cp -a "$backup/collab.cjs" "$backup/repository-extras.cjs" "$backup/migration-manifest.cjs" "$live/src/"
 rm -f /opt/xingzhou-cloud-backend/src/director-versions.cjs
 # Keep the additive version table and any recorded history, never drop data.
 systemctl restart xingzhou-cloud-backend
 echo "DIRECTOR_VERSIONS_ROLLBACK backup=$backup" >&2
}
trap rollback ERR
node "$stage/migrations/apply-director-versions.cjs"
for file in collab.cjs repository-extras.cjs director-versions.cjs migration-manifest.cjs; do install -m 644 "$stage/src/$file" "$live/src/$file"; done
systemctl restart xingzhou-cloud-backend
healthy=false
for attempt in $(seq 1 15); do
 if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi
 sleep 1
done
test "$healthy" = true
node "$stage/test/director-versions-pg-smoke.cjs" "$live/src"
node "$stage/test/cloud-recycle-pg-smoke.cjs" "$live/src"
node "$stage/test/art-composition-pg-smoke.cjs" "$live/src"
systemctl is-active xingzhou-cloud-backend xingzhou-purge.timer
sha256sum "$live/src/collab.cjs" "$live/src/repository-extras.cjs" "$live/src/director-versions.cjs"
trap - ERR
echo "DIRECTOR_VERSIONS_DEPLOYED_2.8.21 backup=$backup"
