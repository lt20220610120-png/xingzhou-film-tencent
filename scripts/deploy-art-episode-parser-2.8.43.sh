#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-art-v2843-stage
backup=/opt/xingzhou-backups/art-episode-parser-2.8.43-$(date -u +%Y%m%dT%H%M%SZ)
expected=${XZ_BASELINE_SHA256:-f34c0ca00740c0d06ef3b9132eb34cd8c6c4d2a277f383ef285dfddd9b67dea4}
test "$(sha256sum "$live/src/collab-episodes.cjs" | cut -d' ' -f1)" = "$expected"
node --test "$stage/test/art-fast-publish-v2843.test.cjs"
node "$stage/pg-smoke.cjs" "$stage/src"
mkdir -p "$backup"
chmod 700 "$backup"
cp -a "$live/src/collab-episodes.cjs" "$backup/"
rollback(){
 trap - ERR
 cp -a "$backup/collab-episodes.cjs" "$live/src/collab-episodes.cjs"
 systemctl restart xingzhou-cloud-backend
 echo "ART_PARSER_ROLLBACK backup=$backup" >&2
}
trap rollback ERR
install -m 644 "$stage/src/collab-episodes.cjs" "$live/src/collab-episodes.cjs"
systemctl restart xingzhou-cloud-backend
healthy=false
for attempt in $(seq 1 15); do
 if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi
 sleep 1
done
test "$healthy" = true
node "$stage/pg-smoke.cjs" "$live/src"
systemctl is-active xingzhou-cloud-backend
trap - ERR
echo "ART_PARSER_DEPLOYED_2.8.43 backup=$backup"
