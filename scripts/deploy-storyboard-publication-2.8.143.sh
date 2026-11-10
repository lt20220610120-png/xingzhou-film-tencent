#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-storyboard-2.8.143-stage
backup=/opt/xingzhou-backups/storyboard-publication-2.8.143-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/storyboard-merge.cjs" | cut -d' ' -f1)" = b78bc22e7b132380f7e2bc7430e6e4161606a527013166b19fe32baa093497ed
test "$(sha256sum "$live/src/collab.cjs" | cut -d' ' -f1)" = 23d3dc5be3f1870f0417217911f0563ec405dd29b030cd6a4d670c99e35b9128
test "$(sha256sum "$live/src/repository-extras.cjs" | cut -d' ' -f1)" = 3a1ed40586bba066f5b0930f1049b10d145575eb3e18256fa5b6e8a3259d46dd
for name in storyboard-merge collab repository-extras; do node --check "$stage/src/$name.cjs"; done
node --test "$stage/test/storyboard-publication143.test.cjs" "$stage/test/storyboard-v220.test.cjs" "$stage/test/storyboard-v222.test.cjs" "$stage/test/prompt-editions134.test.cjs"
mkdir -p "$backup/src"
chmod 700 "$backup"
for name in storyboard-merge collab repository-extras; do cp -a "$live/src/$name.cjs" "$backup/src/"; done
rollback(){ trap - ERR; for name in storyboard-merge collab repository-extras; do cp -a "$backup/src/$name.cjs" "$live/src/"; done; systemctl restart xingzhou-cloud-backend; echo "STORYBOARD_ROLLED_BACK $backup" >&2; }
trap rollback ERR
for name in storyboard-merge collab repository-extras; do install -m 644 "$stage/src/$name.cjs" "$live/src/$name.cjs"; done
systemctl restart xingzhou-cloud-backend
healthy=false
for attempt in $(seq 1 15); do if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi; sleep 1; done
test "$healthy" = true
systemctl is-active xingzhou-cloud-backend
sha256sum "$live/src/storyboard-merge.cjs" "$live/src/collab.cjs" "$live/src/repository-extras.cjs"
trap - ERR
echo "STORYBOARD_PUBLICATION_DEPLOYED backup=$backup"
