#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-autodl-2834-stage
backup=/opt/xingzhou-backups/autodl-audio-2.8.34-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/cos.cjs" | cut -d' ' -f1)" = 1d200d18af2848335e64eb273c36b6efaf1c3a7e7075a65e47ea009125c1be09
test "$(sha256sum "$live/src/generation-references.cjs" | cut -d' ' -f1)" = 18e5b12bce04d4ee443a5bd9162da14bb5d9ce31f0479ad1268128b32f9c17c3
NODE_PATH="$live/node_modules" node --test "$stage/test/generation-references.test.cjs" "$stage/test/cos.test.cjs"
mkdir -p "$backup"; chmod 700 "$backup"
cp -a "$live/src/cos.cjs" "$live/src/generation-references.cjs" "$backup/"
rollback(){ trap - ERR; cp -a "$backup/cos.cjs" "$backup/generation-references.cjs" "$live/src/"; systemctl restart xingzhou-cloud-backend; echo "AUTODL_AUDIO_ROLLBACK backup=$backup" >&2; }
trap rollback ERR
install -m 644 "$stage/src/cos.cjs" "$live/src/cos.cjs"
install -m 644 "$stage/src/generation-references.cjs" "$live/src/generation-references.cjs"
systemctl restart xingzhou-cloud-backend
healthy=false
for attempt in $(seq 1 15); do
 if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi
 sleep 1
done
test "$healthy" = true
systemctl is-active xingzhou-cloud-backend
sha256sum "$live/src/cos.cjs" "$live/src/generation-references.cjs"
trap - ERR
echo "AUTODL_AUDIO_DEPLOYED backup=$backup"
