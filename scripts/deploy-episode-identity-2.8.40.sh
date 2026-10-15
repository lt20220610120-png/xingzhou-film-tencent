#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-episode-v2840-stage
backup=/opt/xingzhou-backups/episode-identity-2.8.40-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/repository-extras.cjs" | cut -d' ' -f1)" = 52a4336380776bdec54f7293816c2fa39a22f95511a9771f738fde75ccf9ba32
test "$(sha256sum "$live/src/collab.cjs" | cut -d' ' -f1)" = 2644fdf98dae3e859f8fd62ffce82b1d8959fe1ba2b466d7018117fda9caa358
test "$(sha256sum "$live/src/collab-episodes.cjs" | cut -d' ' -f1)" = d0cdb12c56164541f6d46fbb53f93233dfd4b211db9a22d5ad406c18d194a52c
node --test "$stage/test/episode-identity-repair.test.cjs"
node "$stage/pg-smoke.cjs" "$stage/src"
mkdir -p "$backup"
chmod 700 "$backup"
cp -a "$live/src/repository-extras.cjs" "$backup/"
cp -a "$live/src/collab.cjs" "$backup/"
cp -a "$live/src/collab-episodes.cjs" "$backup/"
rollback(){
 trap - ERR
 cp -a "$backup/repository-extras.cjs" "$live/src/repository-extras.cjs"
 cp -a "$backup/collab.cjs" "$live/src/collab.cjs"
 cp -a "$backup/collab-episodes.cjs" "$live/src/collab-episodes.cjs"
 systemctl restart xingzhou-cloud-backend
 echo "EPISODE_REPAIR_ROLLBACK backup=$backup" >&2
}
trap rollback ERR
install -m 644 "$stage/src/repository-extras.cjs" "$live/src/repository-extras.cjs"
install -m 644 "$stage/src/collab.cjs" "$live/src/collab.cjs"
install -m 644 "$stage/src/collab-episodes.cjs" "$live/src/collab-episodes.cjs"
install -m 644 "$stage/src/episode-identity-repair.cjs" "$live/src/episode-identity-repair.cjs"
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
echo "EPISODE_REPAIR_DEPLOYED_2.8.40 backup=$backup"
