const test=require('node:test'),assert=require('node:assert/strict');
const {createProtectedSkills,publicAddress,trustedEndpoint}=require('../src/protected-skills.cjs');
const user={id:'u'},payload={taskId:'fixture-job-1',skillId:'builtin:video-prompt-fast-v8-2',input:'整场剧情（1）动作',profile:{endpoint:'https://models.example/v1',model:'fixture',apiKey:'secret-fixture'}};
test('protected skill job sends every private attachment only upstream, deduplicates, isolates and never returns source or key',async()=>{
 let calls=0,config;const service=createProtectedSkills({readSkill:async()=>({name:'private',content:'PRIVATE_RULE_SENTINEL',files:[{path:'references/full.md',content:'ALL_ATTACHMENTS_SENTINEL'}]}),validateEndpoint:async()=>{},requestText:async p=>{calls++;config=p;return '生成的提示词';}});
 assert.equal((await service('protected-skill-start',payload,user)).body.taskId,payload.taskId);
 await service('protected-skill-start',payload,user);await new Promise(r=>setTimeout(r,5));
 const r=await service('protected-skill-status',{taskId:payload.taskId},user);assert.equal(r.body.output,'生成的提示词');assert.equal(calls,1);assert.match(JSON.stringify(config.messages),/PRIVATE_RULE_SENTINEL/);assert.match(JSON.stringify(config.messages),/ALL_ATTACHMENTS_SENTINEL/);
 assert(!JSON.stringify(r).includes('SENTINEL'));assert(!JSON.stringify(r).includes('secret-fixture'));
 assert.equal((await service('protected-skill-status',{taskId:payload.taskId},{id:'other'})).status,404);
 assert.equal((await service('protected-skill-start',{...payload,input:'changed'},user)).status,409);
 assert.equal((await service('protected-skill-start',{...payload,taskId:'another',skillId:'../../private'},user)).status,400);
});
test('an empty 204 upstream response resolves safely rather than throwing from an async response callback',async()=>{
 const https=require('node:https'),dns=require('node:dns/promises'),{EventEmitter}=require('node:events');const original=https.request,lookup=dns.lookup;
 dns.lookup=async()=>[{address:'8.8.8.8',family:4}];
 https.request=(_url,_options,callback)=>{const req=new EventEmitter();req.write=()=>{};req.end=()=>{const res=new EventEmitter();res.statusCode=204;res.headers={};callback(res);process.nextTick(()=>res.emit('end'));};return req;};
 try{const r=await require('../src/protected-skills.cjs').protectedFetch('https://api.openai.com/v1/chat/completions',{method:'POST',body:'{}'});assert.equal(r.status,204);assert.equal(await r.text(),'');}finally{https.request=original;dns.lookup=lookup;}
});
test('consecutive pinned Skill requests share their TLS agent and certificate',async()=>{
 const fs=require('node:fs'),https=require('node:https'),{Readable}=require('node:stream'),{EventEmitter}=require('node:events');
 const request=https.request,read=fs.readFileSync,agents=[];
 let certificates=0;
 fs.readFileSync=(filename,...args)=>{if(String(filename).endsWith('cloud-ip-ca.pem'))certificates++;return read(filename,...args);};
 https.request=(options,callback)=>{
  agents.push(options.agent);
  const request=new EventEmitter();
  request.setTimeout=()=>request;
  request.end=()=>{
   const response=Readable.from([Buffer.from('completed')]);
   response.headers={};
   response.statusCode=200;
   callback(response);
  };
  return request;
 };
 try {
  const {protectedFetch}=require('../src/protected-skills.cjs');
  for(let i=0;i<2;i++)assert.equal(await (await protectedFetch('https://winai.xingzhoufilm.cn/v1/models')).text(),'completed');
  assert.equal(agents.length,2);
  assert.equal(agents[0],agents[1]);
  assert.equal(certificates,1);
 } finally {https.request=request;fs.readFileSync=read;}
});
test('gateway authentication and role checks run before the protected executor',async()=>{
 const {createServer}=require('../src/server.cjs');let calls=0;
 const server=createServer({API_SECRET:'fixture',DATABASE_URL:'postgres://fixture'},{repository:{findBySession:async token=>null},mailer:null,cosSigner:null,protectedSkills:async()=>{calls++;return {status:200,body:{}};}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/gateway',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'protected-skill-start',...payload})});assert.equal(r.status,401);assert.equal(calls,0);}finally{await new Promise(r=>server.close(r));}
});
test('private service rejects local/browser providers, hidden-network destinations and strips provider failures',async()=>{
 const service=createProtectedSkills({readSkill:async()=>({content:'private'}),validateEndpoint:async url=>{if(url.includes('127.0.0.1'))throw Error('private');},requestText:async()=>{throw Error('secret-fixture PRIVATE_RULE_SENTINEL');}});
 assert.equal((await service('protected-skill-start',{...payload,profile:{...payload.profile,provider:'geminiWeb'}},user)).status,400);
 assert.equal((await service('protected-skill-start',{...payload,profile:{...payload.profile,endpoint:'https://127.0.0.1/v1'}},user)).status,400);
 await service('protected-skill-start',payload,user);await new Promise(r=>setTimeout(r,5));assert(!JSON.stringify(await service('protected-skill-status',{taskId:payload.taskId},user)).includes('secret-fixture'));
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','::1','::ffff:127.0.0.1','fd00::1','fe80::1','100.64.0.1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('8.8.8.8'),true);
 for(const url of ['https://attacker.example/v1','https://api.openai.com/my-capture','https://api.deepseek.com/v1?dump=1','https://api.anthropic.com.evil.example/v1'])assert.throws(()=>trustedEndpoint(url));
 for(const url of ['https://api.openai.com/v1','https://api.deepseek.com/v1','https://api.anthropic.com/v1','https://winai.xingzhoufilm.cn/v1'])assert.equal(trustedEndpoint(url).protocol,'https:');
});

test('a clean checkout executes a protected task through the shared text runtime',async()=>{
 let received;
 const service=createProtectedSkills({
  readSkill:async()=>({content:'canonical fixture',files:[{path:'refs/one.md',content:'required annex'}]}),
  validateEndpoint:async()=>{},
  fetchFn:async(url,init)=>{
   assert.equal(url,'https://models.example/v1/chat/completions');
   received=JSON.parse(init.body);
   return Response.json({choices:[{message:{content:'isolated output'},finish_reason:'stop'}]});
  },
 });
 await service('protected-skill-start',payload,user);
 for(let attempt=0;attempt<20;attempt++){
  const result=await service('protected-skill-status',{taskId:payload.taskId},user);
  if(result.body.state==='completed'){
   assert.equal(result.body.output,'isolated output');
   assert.match(received.messages[0].content,/required annex/);
   return;
  }
  assert.equal(result.body.state,'running');
  await new Promise(resolve=>setTimeout(resolve,5));
 }
 assert.fail('The protected task never completed');
});
