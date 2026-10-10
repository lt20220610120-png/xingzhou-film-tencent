#!/usr/bin/env bash
set -euo pipefail
stage=$1
version=$2
digest=$3
size=$4
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ $digest =~ ^[a-f0-9]{64}$ ]]
[[ $size =~ ^[0-9]+$ ]]
[[ $stage =~ ^/home/ubuntu/xingzhou-update-stage-v[0-9]+\.[0-9]+\.[0-9]+-[a-f0-9]{32}$ ]]
test "$(realpath "$stage")" = "$stage"
name=Xingzhou-Film-Tencent-Setup-$version.exe
test -f "$stage/$name" && test ! -L "$stage/$name"
test -f "$stage/latest.json" && test ! -L "$stage/latest.json"
test "$(stat -c %s "$stage/$name")" = "$size"
test "$(sha256sum "$stage/$name" | cut -d' ' -f1)" = "$digest"
test "$(head -c 2 "$stage/$name")" = MZ
python3 - "$stage/latest.json" "$version" "$digest" "$size" <<'PY'
import json, sys
m=json.load(open(sys.argv[1],encoding='utf-8'))
assert m['version']==sys.argv[2] and m['sha256']==sys.argv[3] and m['size']==int(sys.argv[4])
assert m['installerUrl']==f"https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v{m['version']}/Xingzhou-Film-Tencent-Setup-{m['version']}.exe"
assert m['signature']['algorithm']=='Ed25519'
PY
root=/opt/xingzhou-updates
mkdir -p "$root"
if test -e "$root/$name"; then
  test ! -L "$root/$name"
  test "$(sha256sum "$root/$name" | cut -d' ' -f1)" = "$digest"
else
  install -m 644 "$stage/$name" "$root/$name.upload"
  mv "$root/$name.upload" "$root/$name"
fi
install -m 644 "$stage/latest.json" "$root/latest.json.upload"
mv "$root/latest.json.upload" "$root/latest.json"
echo "UPDATE_MIRROR_VERIFIED version=$version size=$size sha256=$digest"
