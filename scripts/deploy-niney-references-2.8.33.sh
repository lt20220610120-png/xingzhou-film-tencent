#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-niney-2833-stage
backup=/opt/xingzhou-backups/niney-references-2.8.33-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/server.cjs" | cut -d' ' -f1)" = 3493c44e9dd50ded3a149fe4f126a50bc219053414c1d94c37b27811834fa59a
test "$(sha256sum "$live/src/cos.cjs" | cut -d' ' -f1)" = 49db1258f5c131f324ab4b31a9dabbc4a0c0ee42443b0df1fe0559ac049322ad
node --check "$stage/src/server.cjs"
NODE_PATH="$live/node_modules" node --test "$stage/test/generation-references.test.cjs" "$stage/test/cos.test.cjs" "$stage/test/server.test.cjs"
mkdir -p "$backup"; chmod 700 "$backup"
cp -a "$live/src/server.cjs" "$live/src/cos.cjs" "$backup/"
test ! -e "$live/src/generation-references.cjs"
rollback(){
 trap - ERR
 cp -a "$backup/server.cjs" "$backup/cos.cjs" "$live/src/"
 rm -f "$live/src/generation-references.cjs"
 systemctl restart xingzhou-cloud-backend
 echo "NINEY_REFERENCE_ROLLBACK backup=$backup" >&2
}
trap rollback ERR
install -m 644 "$stage/src/server.cjs" "$live/src/server.cjs"
install -m 644 "$stage/src/cos.cjs" "$live/src/cos.cjs"
install -m 644 "$stage/src/generation-references.cjs" "$live/src/generation-references.cjs"
install -d -m 700 -o ubuntu -g ubuntu "$live/var/generation-references"
systemctl restart xingzhou-cloud-backend
healthy=false
for attempt in $(seq 1 15); do
 if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi
 sleep 1
done
test "$healthy" = true
XINGZHOU_TEST_SERVER_MODULE="$live/src/server.cjs" NODE_PATH="$live/node_modules" node --test "$stage/test/server.test.cjs"
systemctl is-active xingzhou-cloud-backend
sha256sum "$live/src/server.cjs" "$live/src/cos.cjs" "$live/src/generation-references.cjs"
trap - ERR
echo "NINEY_REFERENCES_DEPLOYED backup=$backup"
