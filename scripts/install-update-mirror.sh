#!/usr/bin/env bash
set -euo pipefail
stage=$1
[[ $stage =~ ^/home/ubuntu/xingzhou-update-stage-v[0-9]+\.[0-9]+\.[0-9]+-[a-f0-9]{32}$ ]]
test "$(realpath "$stage")" = "$stage"
exec python3 -B "$stage/mirror_install.py" "$@"
