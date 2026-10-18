const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createWinAIWebAuth}=require('../src/win-ai-web-auth.cjs');
const {createWinAIIdentity}=require('../src/win-ai-identity.cjs');
const {hashPassword}=require('../src/password.cjs');
const {hashEmailCode}=require('../src/email-code.cjs');
const {createServer}=require('../src/server.cjs');
const origin='https://winai.xingzhoufilm.cn';
async function fixture(run,options={}){
 const user={id:'11111111-1111-4111-8111-111111111111',username:'alice',email:'alice@example.invalid',roles:[],banned:false,password_hash:hashPassword('test-password')};
 const grants=new Map(),sessions=new Map();let emails=0,registers=0,clock=Date.now();
 const repository={findUser:async n=>n===user.username?user:null,createSession:async(_id,raw)=>{const h=require('../src/auth.cjs').tokenHash(raw);sessions.set(h,user);return raw;},deleteSession:async h=>sessions.delete(h),
  winAIGrant:async g=>{if(!sessions.has(g.sessionHash))return null;grants.set(g.hash,{...g,id:user.id});return user;},
  winAIRevokeIdentity:async h=>{const g=grants.get(h);if(g){sessions.delete(g.sessionHash);grants.delete(h);}},
  saveEmailCode:async()=>{},findEmailCode:async()=>({code_hash:hashEmailCode('12345678'),expires_at:new Date(Date.now()+60000).toISOString()}),deleteEmailCode:async()=>{},
  winAIRegister:async input=>{registers++;assert.equal(input.emailCodeHash,hashEmailCode('12345678'));user.username=input.username;user.password_hash=input.passwordHash;return user;},
  resetPasswordAndRevokeSessions:async()=>sessions.clear(),findBySession:async()=>user};
 const identity=createWinAIIdentity({repository,clientSecret:'test-client-secret'});
 const handler=createWinAIWebAuth({repository,identity,mailer:{sendMail:async()=>{emails++;}},now:()=>clock,...options});
 const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const call=async(name,body={},headers={})=>fetch(`http://127.0.0.1:${server.address().port}/api/win-ai/web/${name}`,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
 try{await run({call,user,sessions,repository,counts:()=>({emails,registers}),advance:ms=>clock+=ms});}finally{await new Promise(r=>server.close(r));}
}
test('browser login reuses source password, issues only an HttpOnly identity, and logout revokes that session',()=>fixture(async f=>{
 const r=await f.call('login',{username:'Alice',password:'test-password'});assert.equal(r.status,200);const text=await r.text();assert.deepEqual(JSON.parse(text),{ok:true,next:'/api/win-ai/start'});
 const cookie=r.headers.get('set-cookie');assert.match(cookie,/^__Host-winai_identity=[\w-]{43};/);assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);assert.doesNotMatch(text,/token|password|account/);assert.equal(f.sessions.size,1);
 assert.equal((await f.call('logout',{}, {cookie})).status,200);assert.equal(f.sessions.size,0);
}));
test('public signup uses email verification without an invite, starts source login and rejects mismatched passwords',()=>fixture(async f=>{
 let r=await f.call('register',{username:'newuser',email:'new@example.invalid',password:'test-password',confirmPassword:'different',emailCode:'12345678'});assert.equal(r.status,400);assert.equal(f.counts().registers,0);
 r=await f.call('register',{username:'newuser',email:'new@example.invalid',password:'test-password',confirmPassword:'test-password',emailCode:'12345678',isAdmin:true,roles:['director']});assert.equal(r.status,200);assert.equal(f.counts().registers,1);assert.equal(f.sessions.size,1);assert.match(r.headers.get('set-cookie'),/HttpOnly/);
}));
test('browser credential endpoints reject foreign/missing Origin, non-JSON and oversized input before auth',()=>fixture(async f=>{
 for(const headers of [{origin:'https://evil.invalid'},{origin:''},{'content-type':'text/plain'}])assert.equal((await f.call('login',{username:'alice',password:'test-password'},headers)).status,403);
 assert.equal((await f.call('login',{padding:'x'.repeat(17000)})).status,413);assert.equal(f.sessions.size,0);
 assert.equal((await f.call('login',{username:'alice',password:'wrong'})).status,401);
 assert.equal((await f.call('login','{broken')).status,400);
}));
test('email requests are throttled per mailbox and IP; bounded windows reopen',()=>fixture(async f=>{
 assert.equal((await f.call('email-code',{email:'test@example.invalid'})).status,200);assert.equal((await f.call('email-code',{email:'TEST@example.invalid'})).status,429);assert.equal(f.counts().emails,1);
 f.advance(61000);assert.equal((await f.call('email-code',{email:'test@example.invalid'})).status,200);
}));
test('browser password recovery reuses verified recovery and does not return source credentials',()=>fixture(async f=>{
 const r=await f.call('recover',{username:'alice',email:'alice@example.invalid',emailCode:'12345678',newPassword:'new-password',confirmPassword:'new-password'});assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});
}));
test('native dashboard logout preserves native validation and then revokes the browser identity',()=>fixture(async f=>{
 const r=await f.call('login',{username:'alice',password:'test-password'});assert.equal(f.sessions.size,1);
 const out=await f.call('native-logout',{}, {cookie:r.headers.get('set-cookie')});assert.equal(out.status,200);assert.equal((await out.json()).success,true);assert.equal(f.sessions.size,0);assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
},{nativeLogout:async()=>({status:200,body:{success:true},cookies:['new_api_refresh=; Path=/; Max-Age=0; Secure; HttpOnly']})}));
test('rejected native logout cannot revoke the source identity of a different tab',()=>fixture(async f=>{
 const r=await f.call('login',{username:'alice',password:'test-password'});
 const out=await f.call('native-logout',{}, {cookie:r.headers.get('set-cookie')});assert.equal((await out.json()).success,false);assert.equal(f.sessions.size,1);
},{nativeLogout:async()=>({status:409,body:{success:false,message:'session mismatch'},cookies:[]})}));
test('public source accounts without film roles cannot enter film actions but can view identity',async()=>{
 let projects=0;const repository={findBySession:async()=>({id:'u',roles:[],is_admin:false,is_producer:false}),listProjects:async()=>{projects++;return [];}};
 const server=createServer({API_SECRET:'test',DATABASE_URL:'postgres://test'},{repository,mailer:null,cosSigner:null});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const call=action=>fetch(`http://127.0.0.1:${server.address().port}/api/gateway`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer fake'},body:JSON.stringify({action})});assert.equal((await call('project-list')).status,403);assert.equal(projects,0);assert.equal((await call('session')).status,200);}finally{await new Promise(r=>server.close(r));}
});
