const test=require('node:test');const assert=require('node:assert/strict');
const {session,recover,login}=require('../src/auth.cjs');const {hashEmailCode}=require('../src/email-code.cjs');const {hashPassword}=require('../src/password.cjs');const {createRepository}=require('../src/postgres-repository.cjs');
test('封禁账号不能恢复登录，正常账号只返回公开字段',async()=>{
 assert.equal((await session('synthetic',{findBySession:async()=>({id:'u',banned:true})})).status,403);
 const good=await session('synthetic',{findBySession:async()=>({id:'u',banned:false,password_hash:'secret'})});assert.equal(good.status,200);assert.equal(Object.hasOwn(good.body.account,'password_hash'),false);
});
test('找回密码必须调用同时改密和撤销会话的原子方法，旧凭证不再有效',async()=>{
 let revoked=false;const code='123456';const user={id:'u',email:'test@example.invalid',username:'test'};
 const repo={findEmailCode:async()=>({code_hash:hashEmailCode(code),expires_at:new Date(Date.now()+60000)}),findUser:async()=>user,deleteEmailCode:async()=>{},resetPasswordAndRevokeSessions:async(id,hash,email,codeHash)=>{assert.equal(id,user.id);assert.equal(email,user.email);assert.equal(codeHash,hashEmailCode(code));assert.ok(hash);revoked=true;},findBySession:async()=>revoked?null:user};
 assert.equal((await session('old',repo)).status,200);assert.equal((await recover({username:user.username,email:user.email,emailCode:code,newPassword:'new-test-password'},repo)).status,200);assert.equal((await session('old',repo)).status,401);
});
test('已经消费的验证码不能再次重置密码',async()=>{
 const repo={findEmailCode:async()=>({code_hash:hashEmailCode('123456'),expires_at:new Date(Date.now()+60000)}),findUser:async()=>({id:'u',username:'test',email:'test@example.invalid'}),resetPasswordAndRevokeSessions:async()=>{throw Object.assign(new Error('used'),{code:'AUTH_CODE_USED'})}};
 assert.equal((await recover({username:'test',email:'test@example.invalid',emailCode:'123456',newPassword:'new-password'},repo)).status,400);
});
test('密码重置事务失败必须回滚，封禁时撤销该用户所有会话',async()=>{
 let calls=[],fail=false;const client={query:async(sql,args)=>{calls.push({sql,args});if(fail&&sql.startsWith('delete from app_sessions'))throw new Error('db fail');return {rows:[{id:'u',banned:true}]};},release:()=>calls.push({sql:'release'})};const repo=createRepository('unused',{pool:{connect:async()=>client}});
 await repo.resetPasswordAndRevokeSessions('u','new-hash','test@example.invalid','code-hash');assert.deepEqual(calls.map(x=>x.sql).filter(s=>['begin','commit','rollback'].includes(s)),['begin','commit']);assert.ok(calls.some(x=>x.sql==='delete from app_sessions where user_id=$1'&&x.args[0]==='u'));
 calls=[];fail=true;await assert.rejects(()=>repo.resetPasswordAndRevokeSessions('u','new-hash','test@example.invalid','code-hash'));assert.ok(calls.some(x=>x.sql==='rollback'));assert.equal(calls.some(x=>x.sql==='commit'),false);
 calls=[];fail=false;await repo.setBanned('u',true);assert.ok(calls.some(x=>x.sql==='delete from app_sessions where user_id=$1'));
});
test('登录必须带上验证时的密码摘要，改密或封禁竞态不能发出新会话',async()=>{
 const hash=hashPassword('test-password');let passed;const result=await login({username:'test',password:'test-password'},{findUser:async()=>({id:'u',password_hash:hash}),createSession:async(_id,_token,expected)=>{passed=expected;return null;}});assert.equal(passed,hash);assert.equal(result.status,401);
 let inserts=0;const client={query:async sql=>{if(sql.startsWith('insert'))inserts++;return {rows:[{password_hash:'changed',banned:false}]};},release(){}};const repo=createRepository('unused',{pool:{connect:async()=>client}});assert.equal(await repo.createSession('u','raw','old'),null);assert.equal(inserts,0);
});
