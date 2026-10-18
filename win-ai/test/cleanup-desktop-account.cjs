// Root-only owner fixture cleanup. Refuses any account outside this exact fixture.
const fs=require('node:fs'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
(async()=>{
 const file='/etc/win-ai/identity-qa.json',fixtures=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!Array.isArray(fixtures)||fixtures.length!==2)throw Error('Unexpected fixture');
 const value=fs.readFileSync('/opt/xingzhou-cloud-backend/.env','utf8').split('\n').find(x=>x.startsWith('DATABASE_URL=')).slice(13).trim().replace(/^['"]|['"]$/g,'');
 const r=require('/opt/xingzhou-cloud-backend/src/postgres-repository.cjs').createRepository(value),targets=[];
 for(const f of fixtures){
  if(!/^winaiqa_[a-f0-9]{12}$/.test(f.username))throw Error('Unexpected name');
  const u=await r.findUser(f.username);
  if(!u||u.id!==f.id||u.email!==f.username+'@example.invalid'||u.is_admin||u.is_producer)throw Error('Unexpected source');
  const username='xz_'+crypto.createHash('sha256').update(u.id).digest('hex').slice(0,16);
  const native=JSON.parse(execFileSync('python3',['-c',"import sqlite3,json,sys;d=sqlite3.connect('file:/var/lib/win-ai/gateway.db?mode=ro',uri=True);r=d.execute('select id,role,quota from users where username=? and deleted_at is null',(sys.argv[1],)).fetchone();print(json.dumps(r))",username],{encoding:'utf8'}));
  if(!native||native[0]<=1||native[1]!==1||native[2]!==0)throw Error('Unexpected native');
  targets.push({source:u.id,native:native[0]});
 }
 const headers={'Content-Type':'application/json',Origin:'https://winai.xingzhoufilm.cn',Host:'winai.xingzhoufilm.cn'};
 async function api(path,body,method='POST'){
  const res=await fetch('http://127.0.0.1:8317'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await res.json();if(!data.success)throw Error('Native cleanup refused');return data.data;
 }
 const admin=JSON.parse(fs.readFileSync('/etc/win-ai/admin.json','utf8'));headers.Authorization='Bearer '+(await api('/api/user/login',admin)).access_token;
 for(const t of targets){
  const proof=await api('/api/verify',{method:'password',password:admin.password,scope:'admin.user.delete',context:{user_id:t.native}});
  headers['X-Security-Proof']=proof.proof_token;await api('/api/user/'+t.native,undefined,'DELETE');delete headers['X-Security-Proof'];
  await r.deleteUser(t.source);
 }
 fs.unlinkSync(file);
 console.log(JSON.stringify({nativeTestUsersDeleted:2,sourceTestUsersDeleted:2,realUserRowsModified:0,fixtureCredentialsRemoved:true}));process.exit(0);
})().catch(()=>{console.error('Cleanup refused; inspect tagged fixtures only, never broadly delete');process.exit(1);});
