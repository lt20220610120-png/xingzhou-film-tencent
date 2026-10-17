#!/usr/bin/env bash
set -euo pipefail
# Official binary listens on all interfaces. Keep its port inaccessible publicly.
for command in iptables ip6tables; do
  "$command" -C INPUT ! -i lo -p tcp --dport 8317 -j REJECT 2>/dev/null || "$command" -I INPUT ! -i lo -p tcp --dport 8317 -j REJECT
done
