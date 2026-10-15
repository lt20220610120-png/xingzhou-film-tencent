#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-art-review-v2838-stage
backup=/opt/xingzhou-backups/art-review-2.8.38-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/art-review-repository.cjs" | cut -d' ' -f1)" = 4c2b46aaac0daf3e5300212aedfd6ce153ef11cc629ff4b9656b110f6d39fe01
node --check "$stage/src/art-review-repository.cjs"
node --test "$stage/test/art-review.test.cjs" "$stage/test/art-review-classification.test.cjs"
node "$stage/pg-smoke.cjs" "$stage/src"
mkdir -p "$backup"
chmod 700 "$backup"
cp -a "$live/src/art-review-repository.cjs" "$backup/"
rollback(){
 trap - ERR
 cp -a "$backup/art-review-repository.cjs" "$live/src/art-review-repository.cjs"
 systemctl restart xingzhou-cloud-backend
 echo "ART_REVIEW_ROLLBACK backup=$backup" >&2
}
trap rollback ERR
install -m 644 "$stage/src/art-review-repository.cjs" "$live/src/art-review-repository.cjs"
systemctl restart xingzhou-cloud-backend
healthy=false
for attempt in $(seq 1 15); do
 if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi
 sleep 1
done
test "$healthy" = true
node "$stage/pg-smoke.cjs" "$live/src"
systemctl is-active xingzhou-cloud-backend
sha256sum "$live/src/art-review-repository.cjs"
trap - ERR
echo "ART_REVIEW_DEPLOYED_2.8.38 backup=$backup"
