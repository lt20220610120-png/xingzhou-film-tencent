#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-storyboard-2.8.143-stage
backup=/opt/xingzhou-backups/storyboard-publication-2.8.143-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/storyboard-merge.cjs" | cut -d' ' -f1)" = 3d471350a92315d0a33df576d517a8b93aa824c87aec35b00cddd4f47b2d20c1
test "$(sha256sum "$live/src/collab.cjs" | cut -d' ' -f1)" = f64295faad6ce8da25e16abed69b41c3dd5f1bf2c4e28730e0c3bac00cffce82
test "$(sha256sum "$live/src/repository-extras.cjs" | cut -d' ' -f1)" = 625beff1f780191e57e4d1721b936ad6857b0a8be1ca0c4cab47936fda619266
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
