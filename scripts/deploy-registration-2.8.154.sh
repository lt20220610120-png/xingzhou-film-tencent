#!/usr/bin/env bash
# Scope: exactly three registration runtime files; no env/data/schema access.
set -Eeuo pipefail
umask 077
live=/opt/xingzhou-cloud-backend
stage=${1:?Pass the reviewed absolute stage directory}
[[ "$stage" =~ ^/home/ubuntu/xingzhou-registration-2\.8\.154-[0-9]{8}T[0-9]{6}Z$ ]] || exit 64
[[ $(id -u) = 0 ]] || exit 77
exec 9>/run/lock/xingzhou-registration-2.8.154.lock
flock -n 9
cd "$stage"
backup=/opt/xingzhou-backups/registration-2.8.154-$(date -u +%Y%m%dT%H%M%SZ)
files=(src/auth.cjs src/software-license-repository.cjs shared/registration-validation.mjs)
tests=(test/registration-validation.test.cjs test/auth.test.cjs test/registration-invite-role.test.cjs)
old_hashes(){
  printf '%s\n' 'cab95fb1f3a471f1676bdb68c79402466002427d837edd1155ac260b53912377  src/auth.cjs' '6ed92f186ca20a544ded5da416a5660ef5b7427b8f74001b36241c6b1d8ccc35  src/software-license-repository.cjs'
}
check_originals(){ (cd "$live"; old_hashes | sha256sum --check --strict); test ! -e "$live/shared/registration-validation.mjs"; }
check_payload(){
  (cd "$stage/payload"; sha256sum --check --strict <<'HASHES'
17ce62c3962485091449902bbee42f3f471aff10ea0ccca7785bfc7ce3309c10  src/auth.cjs
a3f14a21d665ce4506642a5333483a9c7993c2a441ed2755e05bc989049b0ab9  src/software-license-repository.cjs
8f02b68f8a695d6a56f80fdcc95b987fcdab092a644ffdded5b4dbf37d39bdca  shared/registration-validation.mjs
66c1e128d04cc45aae488127fd65788185ec83817f21b9e55cabd25bf69ae0ff  test/registration-validation.test.cjs
32481590f3e6b53df70a1bcf006960c63c14686315a2e3f6af8393d21c6469b4  test/auth.test.cjs
dd57e3a0d40e94a86daa2d7ef9c832e98c30a20531db542296af1095a64f0bd8  test/registration-invite-role.test.cjs
HASHES
  )
}
runtime_manifest(){
  (cd "$live"; find src shared -type f \( -name '*.cjs' -o -name '*.mjs' \) ! -path src/auth.cjs ! -path src/software-license-repository.cjs ! -path shared/registration-validation.mjs -print0 | sort -z | xargs -0 sha256sum)
}
run_mock_tests(){
  local root=$1 log=$2
  (cd "$root"; env -i PATH=/usr/bin:/bin HOME="$stage" NODE_PATH="$live/node_modules" node --test "${tests[@]}") | tee "$log"
}
health_check(){
  local destination=$1 healthy=false
  for attempt in $(seq 1 20); do
    if curl --fail --silent --show-error --max-time 3 http://127.0.0.1:4310/healthz >"$destination"; then healthy=true; break; fi
    sleep 1
  done
  test "$healthy" = true
  node -e 'const fs=require("node:fs"),assert=require("node:assert/strict"),body=JSON.parse(fs.readFileSync(process.argv[1]));assert.equal(body.ok,true);assert.equal(body.service,"xingzhou-cloud-backend");console.log("HEALTH_VERIFIED",JSON.stringify(body));' "$destination"
  systemctl is-active --quiet xingzhou-cloud-backend
}
check_originals
check_payload
node --version
mkdir "$stage/runtime" "$stage/live-check"
mkdir "$stage/runtime/src" "$stage/runtime/shared" "$stage/runtime/test" "$stage/live-check/test"
# Copy only runtime code, never .env/config secrets, data, or the service environment.
cp "$live"/src/*.cjs "$stage/runtime/src/"
for f in "$live"/shared/*.cjs "$live"/shared/*.mjs; do test ! -f "$f" || cp "$f" "$stage/runtime/shared/"; done
for rel in "${files[@]}" "${tests[@]}"; do cp "$stage/payload/$rel" "$stage/runtime/$rel"; done
for rel in "${tests[@]}"; do cp "$stage/payload/$rel" "$stage/live-check/$rel"; done
ln -s "$live/src" "$stage/live-check/src"
ln -s "$live/shared" "$stage/live-check/shared"
for rel in "${files[@]}"; do node --check "$stage/runtime/$rel"; done
runtime_manifest > "$stage/unrelated-before.sha256"
run_mock_tests "$stage/runtime" "$stage/stage-tests.tap"
echo STAGE_MOCK_TESTS_PASS
check_originals
check_payload
mkdir "$backup"
mkdir "$backup/src" "$backup/shared"
chmod 700 "$backup"
cp -a "$live/src/auth.cjs" "$live/src/software-license-repository.cjs" "$backup/src/"
printf '%s\n' 'shared/registration-validation.mjs was absent before deployment' > "$backup/shared/registration-validation.mjs.ABSENT"
(cd "$backup"; old_hashes | sha256sum --check --strict; old_hashes > original.sha256)
printf '%s\n' "$backup" > "$stage/backup-path.txt"
changed=false
rollback(){
  local status=${1:-1}
  trap - ERR HUP INT TERM
  set +e
  local failed=0
  if [[ "$changed" = true ]]; then
    cp -a "$backup/src/auth.cjs" "$live/src/auth.cjs" || failed=1
    cp -a "$backup/src/software-license-repository.cjs" "$live/src/software-license-repository.cjs" || failed=1
    rm -f "$live/shared/registration-validation.mjs" || failed=1
    systemctl restart xingzhou-cloud-backend || failed=1
    check_originals || failed=1
    health_check "$stage/rollback-health.json" || failed=1
    echo "REGISTRATION_ROLLBACK backup=$backup verified=$((1-failed))" >&2
  fi
  exit "$status"
}
trap 'rollback $?' ERR
trap 'rollback 129' HUP
trap 'rollback 130' INT
trap 'rollback 143' TERM
check_originals
changed=true
# Install dependency before its consumers. Roll back on any failure below.
install -m 644 "$stage/payload/shared/registration-validation.mjs" "$live/shared/registration-validation.mjs"
install -m 644 "$stage/payload/src/auth.cjs" "$live/src/auth.cjs"
install -m 644 "$stage/payload/src/software-license-repository.cjs" "$live/src/software-license-repository.cjs"
for rel in "${files[@]}"; do cmp "$stage/payload/$rel" "$live/$rel"; node --check "$live/$rel"; done
systemctl restart xingzhou-cloud-backend
health_check "$stage/health.json"
run_mock_tests "$stage/live-check" "$stage/live-tests.tap"
echo LIVE_MOCK_TESTS_PASS
runtime_manifest > "$stage/unrelated-after.sha256"
cmp "$stage/unrelated-before.sha256" "$stage/unrelated-after.sha256"
for rel in "${files[@]}"; do cmp "$stage/payload/$rel" "$live/$rel"; done
(cd "$live"; sha256sum "${files[@]}") | tee "$stage/live.sha256"
(cd "$backup"; sha256sum --check --strict original.sha256)
health_check "$stage/final-health.json"
systemctl is-active xingzhou-cloud-backend
trap - ERR HUP INT TERM
printf 'REGISTRATION_DEPLOYED backup=%s stage=%s\n' "$backup" "$stage"
