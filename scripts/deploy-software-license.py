"""Checked additive migration as DB owner; application keeps its restricted role."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
HOST = 'ubuntu@106.55.41.128'
OPTS = ['-i', str(Path.home()/'.ssh/xingzhou_tencent_test'), '-o', 'BatchMode=yes',
        '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile='+str(Path.home()/'.ssh/known_hosts_xingzhou')]
REMOTE = '/home/ubuntu/xingzhou-license-deploy'
bundle = ROOT/'output/software-license-deploy'
files = ['src/server.cjs', 'src/auth.cjs', 'src/postgres-repository.cjs',
         'src/software-license-repository.cjs', 'src/software-license-service.cjs',
         'shared/software-license.cjs', 'migrations/20261023-software-license.sql']
for name in files:
    target = bundle/'cloud-backend'/name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes((ROOT/'cloud-backend'/name).read_bytes())

expected = [('416fa912-61f5-4d78-8e88-43d2c21ea7b6', 'xingzhou510'),
            ('1ebe0a1f-b0d6-4c1a-a779-c750e1a27f56', 'xingzhou123'),
            ('5a5bf8d3-25c4-4303-9b05-44f1e0e1bdc2', 'staff002')]
sql = (ROOT/'cloud-backend/migrations/20261023-software-license.sql').read_text(encoding='utf-8')
for uid, name in expected:
    sql += f"\nDO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM app_users WHERE id='{uid}' AND username='{name}') THEN RAISE EXCEPTION 'legacy identity precheck failed'; END IF; END $$;\n"
    sql += f"INSERT INTO software_license_exemptions(user_id,reason) VALUES('{uid}','confirmed legacy account exemption 2026-10-23') ON CONFLICT(user_id) DO NOTHING;\n"
tables = ['exemptions', 'devices', 'orders', 'cards', 'pending', 'challenges', 'audit']
sql += 'GRANT SELECT,INSERT,UPDATE,DELETE ON '+','.join('software_license_'+t for t in tables)+',software_licenses TO xingzhou_api;\n'
sql += 'GRANT USAGE,SELECT ON SEQUENCE software_license_audit_id_seq TO xingzhou_api;\n'
(bundle/'apply.sql').write_text(sql, encoding='utf-8', newline='\n')
(bundle/'verify.cjs').write_text("""const {Pool}=require('pg');
(async()=>{const p=new Pool({connectionString:process.env.DATABASE_URL});try{
 const r=await p.query('select count(*)::int as n from software_license_exemptions');
 if(r.rows[0].n!==3)throw Error('exemption verification failed');
 for(const name of ['software_licenses','software_license_cards','software_license_devices','software_license_pending','software_license_challenges','software_license_orders','software_license_audit'])await p.query('select 1 from '+name+' limit 1');
 console.log('APPLICATION_ROLE_AND_THREE_EXEMPTIONS_VERIFIED');
}finally{await p.end()}})().catch(e=>{console.error(e.message);process.exit(1)})
""", encoding='utf-8', newline='\n')
shell = r'''#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/opt/xingzhou-license-deploy
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup=/opt/xingzhou-backups/software-license-$stamp
dropin=/etc/systemd/system/xingzhou-cloud-backend.service.d/software-license.conf
test "$(sha256sum "$live/src/server.cjs" | cut -d' ' -f1)" = cb03a32da1f0e4d9d9d28b343fd45896c620533260695471f4c06f4bb4a1db68
test "$(sha256sum "$live/src/postgres-repository.cjs" | cut -d' ' -f1)" = c4006a619ca3c970e121a10f0cab3a3a364c4aad9711a32cfd6389a246116d93
test "$(sha256sum "$live/src/auth.cjs" | cut -d' ' -f1)" = 41e3743a76c798fcf738802948cee03b4871ad4d0cb0cedd59ea265709d2c200
install -d -m 755 "$stage" "$backup"
cp -a /home/ubuntu/xingzhou-license-deploy/. "$stage/"
chmod -R a+rX "$stage"
for name in server.cjs auth.cjs postgres-repository.cjs; do cp -a "$live/src/$name" "$backup/$name"; done
for name in software-license-repository.cjs software-license-service.cjs; do cp -a "$live/src/$name" "$backup/$name" 2>/dev/null || true; done
cp -a "$live/shared/software-license.cjs" "$backup/software-license.cjs" 2>/dev/null || true
if test -f "$dropin"; then cp -a "$dropin" "$backup/software-license.conf"; fi
rollback(){
 trap - ERR
 for name in server.cjs auth.cjs postgres-repository.cjs software-license-repository.cjs software-license-service.cjs; do test ! -f "$backup/$name" || cp -a "$backup/$name" "$live/src/$name"; done
 test ! -f "$backup/software-license.cjs" || cp -a "$backup/software-license.cjs" "$live/shared/software-license.cjs"
 if test -f "$backup/software-license.conf"; then install -m 644 "$backup/software-license.conf" "$dropin"; else rm -f "$dropin"; fi
 systemctl daemon-reload
 systemctl restart xingzhou-cloud-backend
 echo "SOFTWARE_LICENSE_ROLLBACK backup=$backup" >&2
}
trap rollback ERR
# DDL/FKs need the database owner, not extra privileges on app_users for the app.
sudo -u postgres psql -d xingzhou -v ON_ERROR_STOP=1 -1 -f "$stage/apply.sql"
set -a; . "$live/.env"; set +a
NODE_PATH="$live/node_modules" node "$stage/verify.cjs"
for name in server.cjs auth.cjs postgres-repository.cjs software-license-repository.cjs software-license-service.cjs; do install -m 644 "$stage/cloud-backend/src/$name" "$live/src/$name"; done
install -m 644 "$stage/cloud-backend/shared/software-license.cjs" "$live/shared/software-license.cjs"
install -d -m 755 "$(dirname "$dropin")"
cat > "$dropin" <<'EOF'
[Service]
Environment=TRUST_PROXY=1
EOF
systemctl daemon-reload
systemctl restart xingzhou-cloud-backend
healthy=false
for n in $(seq 1 20); do if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi; sleep 1; done
test "$healthy" = true
systemctl is-active xingzhou-cloud-backend
NODE_PATH="$live/node_modules" node "$stage/verify.cjs"
sha256sum "$live/src/server.cjs" "$live/src/auth.cjs" "$live/src/postgres-repository.cjs" "$live/src/software-license-repository.cjs" "$live/src/software-license-service.cjs" "$live/shared/software-license.cjs"
trap - ERR
echo "SOFTWARE_LICENSE_DEPLOYED backup=$backup"
'''
(bundle/'deploy.sh').write_text(shell, encoding='utf-8', newline='\n')
subprocess.run(['ssh', *OPTS, HOST, 'mkdir -p '+REMOTE], check=True)
subprocess.run(['scp', *OPTS, '-r', str(bundle)+r'\.', HOST+':'+REMOTE+'/'], check=True)
subprocess.run(['ssh', *OPTS, HOST, 'sudo bash '+REMOTE+'/deploy.sh'], check=True)
