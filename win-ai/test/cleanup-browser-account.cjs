// Run as root on the authorized host. Deletes only this run's tagged QA account.
const fs=require('node:fs'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
(async()=>{
 const filename='/etc/win-ai/web-qa.json',f=JSON.parse(fs.readFileSync(filename,'utf8'));
 if(!/^winaiwebqa_[a-f0-9]{12}$/.test(f.username)||f.email!==f.username+'@example.invalid')throw Error('Unexpected fixture');
 const value=fs.readFileSync('/opt/xingzhou-cloud-backend/.env','utf8').split('\n').find(x=>x.startsWith('DATABASE_URL=')).slice(13).trim().replace(/^['"]|['"]$/g,'');
 const r=require('/opt/xingzhou-cloud-backend/src/postgres-repository.cjs').createRepository(value),u=await r.findUser(f.username);if(!u||u.email!==f.email||u.roles.length||u.is_admin||u.is_producer)throw Error('Unexpected source user');
 const nativeUsername='xz_'+crypto.createHash('sha256').update(u.id).digest('hex').slice(0,16);
 const raw=execFileSync('python3',['-c',"import sqlite3,json,sys;d=sqlite3.connect('file:/var/lib/win-ai/gateway.db?mode=ro',uri=True);r=d.execute('select id,role,quota from users where username=? and deleted_at is null',(sys.argv[1],)).fetchone();print(json.dumps(r))",nativeUsername],{encoding:'utf8'});
 const native=JSON.parse(raw);if(!native||native[0]<=1||native[1]!==1||native[2]!==0)throw Error('Unexpected native user');
 const headers={'Content-Type':'application/json',Origin:'https://winai.xingzhoufilm.cn',Host:'winai.xingzhoufilm.cn'};
 async function api(path,body,method='POST'){const response=await fetch('http://127.0.0.1:8317'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();if(!data.success)throw Error('Native API refused fixture cleanup');return data.data;}
 const admin=JSON.parse(fs.readFileSync('/etc/win-ai/admin.json','utf8'));const login=await api('/api/user/login',admin);headers.Authorization='Bearer '+login.access_token;
 const proof=await api('/api/verify',{method:'password',password:admin.password,scope:'admin.user.delete',context:{user_id:native[0]}});
 headers['X-Security-Proof']=proof.proof_token;await api('/api/user/'+native[0],undefined,'DELETE');delete headers['X-Security-Proof'];
 await r.deleteUser(u.id);await r.deleteEmailCode(f.email);fs.unlinkSync(filename);
 await api('/api/user/auth/logout');
 console.log(JSON.stringify({nativeTestUsersDeleted:1,sourceTestUsersDeleted:1,realUserRowsModified:0,fixtureCredentialsRemoved:true}));process.exit(0);
})().catch(()=>{console.error('QA cleanup requires inspection; refused broad deletion');process.exit(1);});
