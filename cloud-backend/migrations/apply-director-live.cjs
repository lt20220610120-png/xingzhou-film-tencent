const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const pid=execFileSync('systemctl',['show','xingzhou-cloud-backend','-p','MainPID','--value'],{encoding:'utf8'}).trim();
const raw=fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').find(v=>v.startsWith('DATABASE_URL='))?.slice(13);if(!raw)throw Error('Database configuration unavailable');
const url=new URL(raw);if(!['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname))throw Error('Requires the existing local database');
const role='"'+decodeURIComponent(url.username).replaceAll('"','""')+'"',sql=fs.readFileSync(path.join(__dirname,'009-director-live.sql'),'utf8');
execFileSync('runuser',['-u','postgres','--','psql','-X','-v','ON_ERROR_STOP=1','-d',decodeURIComponent(url.pathname.slice(1))],{input:`BEGIN; SET LOCAL lock_timeout='5s'; ${sql}\nGRANT SELECT,INSERT,UPDATE ON director_live_documents TO ${role}; GRANT SELECT,INSERT ON director_live_updates TO ${role}; COMMIT;`,encoding:'utf8',stdio:['pipe','pipe','pipe']});
console.log('DIRECTOR_LIVE_MIGRATION_PASS: additive CRDT state and immutable author delta journal, existing permissions retained.');
