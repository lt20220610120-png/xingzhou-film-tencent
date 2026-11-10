#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-storyboard-2.8.144-stage
backup=/opt/xingzhou-backups/storyboard-settings-2.8.144-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/storyboard-merge.cjs" | cut -d' ' -f1)" = 01c10c1de64562ec6bf27e40e9f1f90b64a7246a3624c4460e28ff4568d2fdd4
test ! -e "$live/src/storyboard-settings.cjs"
node --check "$stage/src/storyboard-settings.cjs"
node --check "$stage/src/storyboard-merge.cjs"
node --test "$stage/test/storyboard-settings144.test.cjs" "$stage/test/storyboard-publication143.test.cjs" "$stage/test/storyboard-v220.test.cjs" "$stage/test/storyboard-v222.test.cjs" "$stage/test/prompt-editions134.test.cjs"
mkdir -p "$backup/src"
chmod 700 "$backup"
cp -a "$live/src/storyboard-merge.cjs" "$backup/src/"
rollback(){ trap - ERR; cp -a "$backup/src/storyboard-merge.cjs" "$live/src/"; rm -f "$live/src/storyboard-settings.cjs"; systemctl restart xingzhou-cloud-backend; echo "SETTINGS_ROLLED_BACK $backup" >&2; }
trap rollback ERR
install -m 644 "$stage/src/storyboard-settings.cjs" "$live/src/storyboard-settings.cjs"
install -m 644 "$stage/src/storyboard-merge.cjs" "$live/src/storyboard-merge.cjs"
systemctl restart xingzhou-cloud-backend
healthy=false
for attempt in $(seq 1 15); do if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi; sleep 1; done
test "$healthy" = true
systemctl is-active xingzhou-cloud-backend
sha256sum "$live/src/storyboard-merge.cjs" "$live/src/storyboard-settings.cjs"
trap - ERR
echo "STORYBOARD_SETTINGS_DEPLOYED backup=$backup"
