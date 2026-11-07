#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-startup-2.8.127-stage
backup=/opt/xingzhou-backups/startup-invites-2.8.127-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/invites.cjs" | cut -d' ' -f1)" = d1690b3d79d933cccac99587f17d8b8aa306948b1f0735e0fce03b6fd784de9b
test "$(sha256sum "$live/src/auth.cjs" | cut -d' ' -f1)" = e0653e1e4f96c77b60f28e4ee2cd8723bfe32899b6205a070148e639cf4b2c28
test "$(sha256sum "$live/src/software-license-repository.cjs" | cut -d' ' -f1)" = 9361dfbd495c3c66e17bf0e6693441a606a1477b0eb403f663fec687b5e9b0a3
for file in invites.cjs auth.cjs software-license-repository.cjs; do node --check "$stage/src/$file"; done
cp "$live/src/password.cjs" "$live/src/email-code.cjs" "$stage/src/"
cp "$live/shared/software-license.cjs" "$stage/shared/"
NODE_PATH="$live/node_modules" node --test "$stage/test/registration-invite-role.test.cjs"
mkdir -p "$backup/src"
chmod 700 "$backup"
for file in invites.cjs auth.cjs software-license-repository.cjs; do cp -a "$live/src/$file" "$backup/src/$file"; done
rollback(){ trap - ERR; for file in invites.cjs auth.cjs software-license-repository.cjs; do cp -a "$backup/src/$file" "$live/src/$file"; done; systemctl restart xingzhou-cloud-backend; echo "STARTUP_INVITES_ROLLED_BACK $backup" >&2; }
trap rollback ERR
for file in invites.cjs auth.cjs software-license-repository.cjs; do install -m 644 "$stage/src/$file" "$live/src/$file"; done
systemctl restart xingzhou-cloud-backend
healthy=false
for attempt in $(seq 1 15); do if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi; sleep 1; done
test "$healthy" = true
node - "$live" <<'JS'
const assert=require('node:assert/strict'),root=process.argv[2],{rolesForInvite}=require(root+'/src/invites.cjs');
for(const role of ['director','creator'])assert.deepEqual(rolesForInvite({kind:'role',role}).roles,[role]);
assert(rolesForInvite({kind:'role',role:'director'},'creator').error);
assert(rolesForInvite({kind:'unlock',role:'director'}).error);
console.log('LIVE_INVITE_ROLE_CHECK_PASS');
JS
systemctl is-active xingzhou-cloud-backend
sha256sum "$live/src/invites.cjs" "$live/src/auth.cjs" "$live/src/software-license-repository.cjs"
trap - ERR
echo "STARTUP_INVITES_DEPLOYED backup=$backup"
