#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-2.8.146-stage
backup=/opt/xingzhou-backups/storyboard-2.8.146-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/media.cjs" | cut -d' ' -f1)" = 46dbdb3d7aed0f11a9b014f00ac1b2a7bac36e5891ab884345c693ed7b194d0e
test "$(sha256sum "$live/src/postgres-repository.cjs" | cut -d' ' -f1)" = 3316c4cba9b9bf59bef67f15c83c5fe7cf70cc57583656516f6a2f9cdfd32260
test "$(sha256sum "$live/src/storyboard-merge.cjs" | cut -d' ' -f1)" = 85f2b73ba872cb05d3b6950b0e83f319102acf9a485af5ad62b41e6020a81875
test "$(sha256sum "$live/src/storyboard-settings.cjs" | cut -d' ' -f1)" = a1a723d61a2f53cade57cea794940978080e9279a1549950a0878791e6037a70
node --check "$stage/src/media.cjs"
node --check "$stage/src/postgres-repository.cjs"
test ! -e "$live/src/reference-upload-delete.cjs"
node --check "$stage/src/reference-upload-delete.cjs"
node --check "$stage/src/storyboard-merge.cjs"
node --check "$stage/src/storyboard-settings.cjs"
test ! -e "$live/src/prompt-duration.cjs"
node --check "$stage/src/prompt-duration.cjs"
node --test "$stage/test/"*.test.cjs
mkdir -p "$backup/src"
chmod 700 "$backup"
cp -a "$live/src/media.cjs" "$backup/src/"
cp -a "$live/src/postgres-repository.cjs" "$backup/src/"
cp -a "$live/src/storyboard-merge.cjs" "$backup/src/"
cp -a "$live/src/storyboard-settings.cjs" "$backup/src/"
rollback(){ trap - ERR; cp -a "$backup/src/media.cjs" "$live/src/"; cp -a "$backup/src/postgres-repository.cjs" "$live/src/"; rm -f "$live/src/reference-upload-delete.cjs"; cp -a "$backup/src/storyboard-merge.cjs" "$live/src/"; cp -a "$backup/src/storyboard-settings.cjs" "$live/src/"; rm -f "$live/src/prompt-duration.cjs"; systemctl restart xingzhou-cloud-backend; echo "ROLLED_BACK $backup" >&2; }
trap rollback ERR
install -m 644 "$stage/src/media.cjs" "$live/src/media.cjs.146-new"
mv -f "$live/src/media.cjs.146-new" "$live/src/media.cjs"
install -m 644 "$stage/src/postgres-repository.cjs" "$live/src/postgres-repository.cjs.146-new"
mv -f "$live/src/postgres-repository.cjs.146-new" "$live/src/postgres-repository.cjs"
install -m 644 "$stage/src/reference-upload-delete.cjs" "$live/src/reference-upload-delete.cjs.146-new"
mv -f "$live/src/reference-upload-delete.cjs.146-new" "$live/src/reference-upload-delete.cjs"
install -m 644 "$stage/src/storyboard-merge.cjs" "$live/src/storyboard-merge.cjs.146-new"
mv -f "$live/src/storyboard-merge.cjs.146-new" "$live/src/storyboard-merge.cjs"
install -m 644 "$stage/src/storyboard-settings.cjs" "$live/src/storyboard-settings.cjs.146-new"
mv -f "$live/src/storyboard-settings.cjs.146-new" "$live/src/storyboard-settings.cjs"
install -m 644 "$stage/src/prompt-duration.cjs" "$live/src/prompt-duration.cjs.146-new"
mv -f "$live/src/prompt-duration.cjs.146-new" "$live/src/prompt-duration.cjs"
systemctl restart xingzhou-cloud-backend
healthy=false
for attempt in $(seq 1 15); do if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi; sleep 1; done
test "$healthy" = true
systemctl is-active xingzhou-cloud-backend
sha256sum "$live/src/media.cjs" "$live/src/postgres-repository.cjs" "$live/src/reference-upload-delete.cjs" "$live/src/storyboard-merge.cjs" "$live/src/storyboard-settings.cjs" "$live/src/prompt-duration.cjs"
trap - ERR
echo "DEPLOYED_146 backup=$backup"
