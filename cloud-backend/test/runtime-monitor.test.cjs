const test=require('node:test');
const assert=require('node:assert/strict');
const {setImmediate}=require('node:timers/promises');
const {tokenHash}=require('../src/auth.cjs');
const {createRuntimeMonitor}=require('../src/runtime-monitor.cjs');
const {createServer}=require('../src/server.cjs');
const {desktopRuntimeMonitor}=require('../../electron/runtime-monitor.cjs');

test('only fixed, anonymous fields are accepted from main, renderer and gateway incidents',async t=>{
  const events=[];
  const monitor=createRuntimeMonitor({
    dsn:'http://public_fixture@127.0.0.1:4340/1',version:'2.8.212',
    fetchFn:async (url,options)=>{
      assert.equal(String(url),'http://127.0.0.1:4340/api/1/envelope/');
      assert.equal(options.redirect,'error');
      const [header,item,data]=options.body.split('\n');
      assert.equal(JSON.parse(item).length,Buffer.byteLength(data));
      const event=JSON.parse(data);
      assert.equal(JSON.parse(header).event_id,event.event_id);
      assert.doesNotMatch(options.body,/fiction|PRIVATE-TOKEN|one-user|X:\\private|password|private@example/);
      events.push(event);
      return new Response(null,{status:202});
    },
  });
  const handler=createServer({API_SECRET:'fixture',DATABASE_URL:'fixture'},{runtimeMonitor:monitor,repository:{
    findBySession:async token=>token===tokenHash('fixture-session')?{id:'one-user'}:null,
    getProjectAccess:async()=>{throw Object.assign(Error('private@example'),{code:'backend_down'});},
  },mailer:null,cosSigner:null,logger:{error:()=>{},log:()=>{}}});
  await new Promise(resolve=>handler.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>handler.close(resolve)));
  const url=`http://127.0.0.1:${handler.address().port}/api/gateway`;
  const gateway=(payload,token='')=>fetch(url,{method:'POST',headers:{
    'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),
  },body:JSON.stringify(payload)});
  const unsafe={message:'fiction PRIVATE-TOKEN',stack:'X:\\private',password:'hidden',email:'private@example'};
  const incident={operation:'render-error',surface:'renderer',version:'2.8.212',mode:'local',...unsafe};
  assert.equal((await gateway({action:'runtime-incident',incident})).status,401);
  assert.equal((await gateway({action:'runtime-incident',incident},'fixture-session')).status,202);
  assert.equal((await gateway({action:'runtime-incident',incident},'fixture-session')).status,202);
  let completeDesktop;
  const desktopSent=new Promise(resolve=>{completeDesktop=resolve;});
  const desktop=desktopRuntimeMonitor({
    version:'2.8.212',enabled:true,token:()=>'fixture-session',
    send:async(value,token)=>{
      const response=await gateway({action:'runtime-incident',incident:value},token);
      completeDesktop(response.status);
    },
  });
  desktop('main','libtv-submit',{mode:'local',status:503,...unsafe});
  await gateway({action:'project-get',projectId:'fixture-project'},'fixture-session');
  assert.equal(await desktopSent,202);
  await setImmediate();
  assert.deepEqual(events.map(event=>event.tags.surface).sort(),['cloud','main','renderer']);
  assert.ok(events.every(event=>event.release==='xingzhou-film@2.8.212'));
  assert.ok(events.some(event=>event.tags.mode==='local'));
});

test('disabled or unavailable monitoring remains outside the request path',async()=>{
  let requests=0;
  const rejected=createRuntimeMonitor({dsn:'http://example.com/1',version:'2.8.212',fetchFn:()=>requests++});
  assert.equal(rejected.enabled,false);
  rejected.cloud({operation:'uncaught'});
  const active=createRuntimeMonitor({dsn:'http://public_fixture@127.0.0.1:4340/1',version:'2.8.212',fetchFn:async()=>{
    requests++;
    throw Error('offline');
  }});
  assert.equal(active.cloud({operation:'uncaught'}),undefined);
  await setImmediate();
  assert.equal(requests,1);
});
