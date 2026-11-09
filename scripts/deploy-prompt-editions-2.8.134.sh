#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-editions-2.8.134-stage
backup=/opt/xingzhou-backups/prompt-editions-2.8.134-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/storyboard-merge.cjs" | cut -d' ' -f1)" = e4f826f4ba83a7ead4db1e2eb636b08c9099ff4a99118fff69840e2006984b02
test "$(sha256sum "$live/shared/directorSharedDocument.mjs" | cut -d' ' -f1)" = 6b175a32f85cf5ee296a7fc3928806b17ed380861c6a883e7375957c40843f9a
cp "$live/src/storyboard-identity.cjs" "$live/src/collab-episodes.cjs" "$live/src/director-source.cjs" "$stage/src/"
test -L "$stage/node_modules" || ln -s "$live/node_modules" "$stage/node_modules"
node --check "$stage/src/storyboard-merge.cjs"
node --check "$stage/shared/directorSharedDocument.mjs"
node --test "$stage/test/prompt-editions134.test.cjs" "$stage/test/live-editions134.test.mjs"
mkdir -p "$backup/src" "$backup/shared"
chmod 700 "$backup"
cp -a "$live/src/storyboard-merge.cjs" "$backup/src/"
cp -a "$live/shared/directorSharedDocument.mjs" "$backup/shared/"
rollback(){ trap - ERR; cp -a "$backup/src/storyboard-merge.cjs" "$live/src/"; cp -a "$backup/shared/directorSharedDocument.mjs" "$live/shared/"; systemctl restart xingzhou-cloud-backend; echo "EDITIONS_ROLLED_BACK $backup" >&2; }
trap rollback ERR
install -m 644 "$stage/src/storyboard-merge.cjs" "$live/src/storyboard-merge.cjs"
install -m 644 "$stage/shared/directorSharedDocument.mjs" "$live/shared/directorSharedDocument.mjs"
systemctl restart xingzhou-cloud-backend
healthy=false
for attempt in $(seq 1 15); do if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi; sleep 1; done
test "$healthy" = true
systemctl is-active xingzhou-cloud-backend
sha256sum "$live/src/storyboard-merge.cjs" "$live/shared/directorSharedDocument.mjs"
trap - ERR
echo "PROMPT_EDITIONS_DEPLOYED backup=$backup"
