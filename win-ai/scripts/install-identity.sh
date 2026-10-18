#!/usr/bin/env bash
set -euo pipefail
stage=${1:?stage required}
test "$(id -u)" = 0
test "$(realpath "$stage")" = /home/ubuntu/xingzhou-winai-v2846-stage
app=/opt/xingzhou-cloud-backend
node "$stage/win-ai/test/postgres-identity.cjs"
node --check "$stage/cloud-backend/src/server.cjs"
node --check "$stage/cloud-backend/src/win-ai-identity.cjs"
backup=/opt/win-ai/backups/identity-$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$backup" "$backup/src" "$backup/dropin"
cp -a /etc/nginx/conf.d/win-ai.conf "$backup/nginx.conf"
if test -f /etc/nginx/conf.d/win-ai-ip-https.conf; then cp -a /etc/nginx/conf.d/win-ai-ip-https.conf "$backup/ip-https.conf"; fi
cp -a /opt/win-ai/public "$backup/public"
files=(server.cjs postgres-repository.cjs win-ai-identity.cjs win-ai-repository.cjs win-ai-sqlite.py win-ai-lookup.cjs win-ai-payment.cjs)
for name in "${files[@]}"; do
  if test -f "$app/src/$name"; then cp -a "$app/src/$name" "$backup/src/$name"; fi
done
dropin=/etc/systemd/system/xingzhou-cloud-backend.service.d/win-ai-identity.conf
if test -f "$dropin"; then cp -a "$dropin" "$backup/dropin/win-ai-identity.conf"; fi
rollback() {
  result=$1; trap - ERR
  for name in "${files[@]}"; do
    if test -f "$backup/src/$name"; then cp -a "$backup/src/$name" "$app/src/$name"; else rm -f -- "$app/src/$name"; fi
  done
  if test -f "$backup/dropin/win-ai-identity.conf"; then cp -a "$backup/dropin/win-ai-identity.conf" "$dropin"; else rm -f -- "$dropin"; fi
  cp -a "$backup/nginx.conf" /etc/nginx/conf.d/win-ai.conf
  if test -f "$backup/ip-https.conf"; then cp -a "$backup/ip-https.conf" /etc/nginx/conf.d/win-ai-ip-https.conf; fi
  cp -a "$backup/public/." /opt/win-ai/public/
  systemctl daemon-reload; systemctl restart xingzhou-cloud-backend
  if nginx -t; then systemctl reload nginx; fi
  echo 'Identity deployment failed; previous service files and proxy restored' >&2
  exit "$result"
}
trap 'rollback $?' ERR
for name in "${files[@]}"; do install -m 644 "$stage/cloud-backend/src/$name" "$app/src/$name"; done
install -d -m 755 "$app/migrations"
install -m 644 "$stage/cloud-backend/migrations/20261018_win_ai_identity.sql" "$app/migrations/"
if ! test -f /etc/win-ai/identity.env; then
  python3 -c "import os,secrets;f=os.open('/etc/win-ai/identity.env',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);os.write(f,('WIN_AI_OAUTH_CLIENT_SECRET='+secrets.token_urlsafe(48)+'\n').encode());os.close(f)"
fi
install -d -m 755 /etc/systemd/system/xingzhou-cloud-backend.service.d
cat > "$dropin" <<'EOF'
[Service]
EnvironmentFile=/etc/win-ai/identity.env
SupplementaryGroups=win-ai
ReadOnlyPaths=/var/lib/win-ai
EOF
node - "$stage/cloud-backend/migrations/20261018_win_ai_identity.sql" <<'NODE'
const fs=require('node:fs');const {Client}=require('/opt/xingzhou-cloud-backend/node_modules/pg');
const value=fs.readFileSync('/opt/xingzhou-cloud-backend/.env','utf8').split('\n').find(x=>x.startsWith('DATABASE_URL=')).slice(13).trim().replace(/^['"]|['"]$/g,'');
const parameters=new Client({connectionString:value}).connectionParameters;
const role='"'+parameters.user.replaceAll('"','""')+'"';
const sql='begin;\n'+fs.readFileSync(process.argv[2],'utf8')+'\ngrant select,insert,update,delete on win_ai_auth_grants,win_ai_session_links,win_ai_user_links to '+role+';\ncommit;';
const result=require('node:child_process').spawnSync('sudo',['-u','postgres','psql','-d',parameters.database,'-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
if(result.status!==0){console.error('Identity migration failed');process.exitCode=1;}else console.log('Additive Win AI identity migration applied with owner privileges; runtime receives only table DML grants');
NODE
systemctl daemon-reload
systemctl restart xingzhou-cloud-backend
curl --fail --silent --retry 6 --retry-all-errors --retry-delay 1 http://127.0.0.1:4310/healthz >/dev/null
install -m 644 "$stage/win-ai/nginx.conf" /etc/nginx/conf.d/win-ai.conf
if test -f /etc/nginx/conf.d/win-ai-ip-https.conf; then install -m 644 "$stage/win-ai/ip-https.conf" /etc/nginx/conf.d/win-ai-ip-https.conf; fi
install -m 644 "$stage/win-ai/public/"* /opt/win-ai/public/
nginx -t
systemctl reload nginx
curl --fail --silent --resolve winai.xingzhoufilm.cn:443:127.0.0.1 https://winai.xingzhoufilm.cn/api/status >/dev/null
trap - ERR
python3 "$stage/win-ai/scripts/configure-identity.py"
echo 'Win AI identity bridge and native wallet deployed'
