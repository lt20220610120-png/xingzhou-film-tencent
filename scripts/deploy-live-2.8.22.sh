#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-live-v2822-stage
backup=/opt/xingzhou-backups/live-2.8.22-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/collab.cjs" | cut -d' ' -f1)" = f9022d6fedb4bddc06a2b6aa6ba6d8f0aedc02460b500b196ce86dc9497183ee
test "$(sha256sum "$live/src/repository-extras.cjs" | cut -d' ' -f1)" = e3438fa3e227b071a5d27c2ccf8610036f2279d18e1a9fc6a0113a469b02df89
test "$(sha256sum "$live/src/director-versions.cjs" | cut -d' ' -f1)" = 58c6727bb7472de78162991ad19630f6cf9221ef217156f097df9899bb434bed
test "$(sha256sum "$live/src/server.cjs" | cut -d' ' -f1)" = c8a8a07c4d30dbbd8725b67f28e97d5e353a462097d93838664db04d6050c82c
for file in collab.cjs repository-extras.cjs director-versions.cjs director-live.cjs server.cjs update-download.cjs migration-manifest.cjs; do node --check "$stage/src/$file"; done
node "$stage/test/director-live-pg-smoke.cjs" "$stage/src"
mkdir -p "$backup"
chmod 700 "$backup"
for file in collab.cjs repository-extras.cjs director-versions.cjs server.cjs migration-manifest.cjs; do cp -a "$live/src/$file" "$backup/"; done
cp -a "$live/package.json" "$live/package-lock.json" "$backup/"
rollback(){
 trap - ERR
 for file in collab.cjs repository-extras.cjs director-versions.cjs server.cjs migration-manifest.cjs; do cp -a "$backup/$file" "$live/src/$file"; done
 cp -a "$backup/package.json" "$backup/package-lock.json" "$live/"
 systemctl restart xingzhou-cloud-backend
 echo "LIVE_2822_ROLLBACK backup=$backup" >&2
}
trap rollback ERR
node "$stage/migrations/apply-director-live.cjs"
cp -a "$stage/package.json" "$stage/package-lock.json" "$live/"
cd "$live"
npm install --omit=dev --ignore-scripts --no-audit --no-fund
mkdir -p "$live/shared" /opt/xingzhou-updates
install -m 644 "$stage/shared/directorSharedDocument.mjs" "$live/shared/directorSharedDocument.mjs"
for file in collab.cjs repository-extras.cjs director-versions.cjs director-live.cjs server.cjs update-download.cjs migration-manifest.cjs; do install -m 644 "$stage/src/$file" "$live/src/$file"; done
systemctl restart xingzhou-cloud-backend
healthy=false
for attempt in $(seq 1 15); do if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi; sleep 1; done
test "$healthy" = true
node "$stage/test/director-live-pg-smoke.cjs" "$live/src"
node "$stage/test/director-versions-pg-smoke.cjs" "$live/src"
node "$stage/test/cloud-recycle-pg-smoke.cjs" "$live/src"
systemctl is-active xingzhou-cloud-backend xingzhou-purge.timer
trap - ERR
echo "LIVE_2822_DEPLOYED backup=$backup"
