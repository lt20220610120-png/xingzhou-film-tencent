const test=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('../src/server.cjs');
test('unchanged project polls return a small response but edits and revoked access are checked',async t=>{
  let allowed=true,script='完整剧本'.repeat(30000);
  const repo={findBySession:async()=>({id:'u'}),getProject:async()=>allowed?{id:'p',script}:null,findMembership:async()=>({role:'producer'})};
  const server=createServer({API_SECRET:'test',DATABASE_URL:'postgres://test'},{repository:repo,mailer:null,cosSigner:null});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const request=revision=>fetch(`http://127.0.0.1:${server.address().port}/api/gateway`,{method:'POST',headers:{'content-type':'application/json','x-xingzhou-snapshot':'1','x-xingzhou-known-revision':revision||''},body:JSON.stringify({action:'project-get',projectId:'p'})});
  const first=await (await request()).json();
  assert.equal(first._xzSnapshot?.value.script,script);
  const revision=first._xzSnapshot.revision;
  const unchanged=await (await request(revision)).text();
  assert.ok(unchanged.length<180);assert.equal(JSON.parse(unchanged)._xzSnapshot.unchanged,true);
  script='新的剧本';const changed=await (await request(revision)).json();
  assert.equal(changed._xzSnapshot.value.script,'新的剧本');
  allowed=false;const denied=await request(changed._xzSnapshot.revision);
  assert.equal(denied.status,404);assert.equal((await denied.json())._xzSnapshot,undefined);
});
