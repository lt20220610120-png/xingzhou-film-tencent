import test from 'node:test';import assert from 'node:assert/strict';
import {Y,seedDocument,readDocument,editDocument,encode64,decode64,documentEpoch,assertCompatibleUpdate} from '../cloud-backend/shared/directorSharedDocument.mjs';
import {createDirectorRealtime} from './directorRealtime.js';
import {versionPreviewPages} from './versionPreview.js';
const original={name:'五人协作',script:'原稿',episodes:[{id:'episode',content:'1-1 街道 日 外\n人物：甲\n甲：你好',prompts:[]}],style:'真人电影级',aspectRatio:'16:9'};
function fixture(){let server=seedDocument(original);const seen=new Set();let online=true,calls=0;
 const call=async p=>{calls++;assert.equal(p.protocol,3);if(!online)throw Error('offline');const reset=p.epoch!==documentEpoch(server);if(p.update&&!reset&&!seen.has(p.updateId)){assertCompatibleUpdate(server,decode64(p.update));Y.applyUpdate(server,decode64(p.update));seen.add(p.updateId);}return {protocol:3,epoch:documentEpoch(server),reset,update:encode64(Y.encodeStateAsUpdate(server,!reset&&p.vector?decode64(p.vector):undefined)),vector:encode64(Y.encodeStateVector(server)),ack:reset?null:p.updateId,locked:false,myRole:'collaborator'};};
 return {get server(){return server},restore:value=>{server.destroy();server=seedDocument(value);},call,seen,online:value=>{online=value},calls:()=>calls};
}
test('five clients merge the same initially absent scene text and independent prompts; reconnect is idempotent',async()=>{
 const f=fixture(),clients=[];
 for(let i=0;i<5;i++){let project={id:'local-'+i,masterScript:original.script,...structuredClone(original)},saved;
  const c=createDirectorRealtime({readProject:()=>project,applyProject:d=>{project={...project,...d,masterScript:d.script};},call:f.call,save:async d=>{saved=d;},load:async()=>saved});await c.start();clients.push({c,read:()=>project,write:p=>{project=p;}});
 }
 f.online(false);
 for(const [i,client] of clients.entries()){const p=client.read();client.write({...p,episodes:[{...p.episodes[0],quickSceneEdits:{'1-1':'成员'+i},prompts:[{id:'p'+i,text:'提示词'+i}]}]});await client.c.sync();}
 f.online(true);await Promise.all(clients.map(({c})=>c.sync()));await Promise.all(clients.map(({c})=>c.sync()));
 const result=readDocument(f.server);assert.equal(result.episodes[0].prompts.length,5);
 for(let i=0;i<5;i++)assert.ok(result.episodes[0].quickSceneEdits['1-1'].includes('成员'+i));
 for(const client of clients){assert.deepEqual(client.read().episodes,result.episodes);await client.c.sync();}
 assert.equal(f.seen.size,5);for(const {c} of clients)await c.stop();
});
test('offline restart preserves unsent text and changes made during a synchronization response',async()=>{
 const f=fixture();let project={id:'local',...structuredClone(original),masterScript:original.script},saved;
 const options={readProject:()=>project,applyProject:d=>{project={...project,...d,masterScript:d.script}},call:f.call,save:async d=>{saved=structuredClone(d)},load:async()=>saved};
 const a=createDirectorRealtime(options);await a.start();f.online(false);project={...project,masterScript:'离线修改'};await a.sync();await a.stop();
 f.online(true);const b=createDirectorRealtime(options);await b.start();await b.sync();assert.equal(readDocument(f.server).script,'离线修改');await b.stop();
});
test('surrogate boundaries survive compact edits and an 87k script preview is bounded without losing content',()=>{
 const d=seedDocument({...original,script:'甲🙂乙'}),before=readDocument(d);editDocument(d,before,{...before,script:'甲🙃乙'});assert.equal(readDocument(d).script,'甲🙃乙');
 const text=('一行剧本内容\n').repeat(11000),pages=versionPreviewPages(text);assert.equal(pages.join(''),text);assert.ok(pages.every(p=>p.length<=6000));assert.ok(pages.length>10);
});
test('startup reconnect and a CRDT checkpoint newer than the large project file preserve writing',async()=>{
 const f=fixture();let project={id:'local',...structuredClone(original),masterScript:original.script},cache;
 const options={readProject:()=>project,applyProject:d=>{project={...project,...d,masterScript:d.script}},call:f.call,load:async()=>cache,save:async d=>{cache=structuredClone(d)}};
 const c=createDirectorRealtime(options);f.online(false);await assert.rejects(c.start(),/offline/);f.online(true);await c.sync();assert.equal(c.ready(),true);
 const stale=structuredClone(project);f.online(false);project={...project,masterScript:'尚未写入大资料文件的新稿'};await c.sync();await c.stop();project=stale;
 const restarted=createDirectorRealtime(options);f.online(true);await restarted.start();assert.equal(project.masterScript,'尚未写入大资料文件的新稿');await restarted.sync();assert.equal(readDocument(f.server).script,project.masterScript);await restarted.stop();
});
test('pure remote deletions update both project view and local checkpoint without a state-vector change',async()=>{
 const f=fixture();let project={id:'local',...structuredClone(original),masterScript:original.script},cached;
 const c=createDirectorRealtime({readProject:()=>project,applyProject:d=>{project={...project,...d,masterScript:d.script}},call:f.call,save:async d=>{cached=structuredClone(d)}});await c.start();
 const beforeVector=encode64(Y.encodeStateVector(f.server)),before=readDocument(f.server);editDocument(f.server,before,{...before,script:'原'});
 assert.equal(encode64(Y.encodeStateVector(f.server)),beforeVector);await c.sync();assert.equal(project.masterScript,'原');const saved=new Y.Doc();Y.applyUpdate(saved,decode64(cached.state));assert.equal(readDocument(saved).script,'原');await c.stop();
});
test('version checkpoint queues behind a poll and initial shared document round-trips exactly',async()=>{
 assert.deepEqual(readDocument(seedDocument(original)),original);
 const f=fixture();let project={id:'local',...structuredClone(original),masterScript:original.script},release,hold=false;const requests=[];
 const c=createDirectorRealtime({readProject:()=>project,applyProject:d=>{project={...project,...d,masterScript:d.script}},call:async p=>{requests.push(p);if(hold){hold=false;await new Promise(r=>{release=r;});}return f.call(p);}});await c.start();hold=true;const poll=c.sync();await new Promise(r=>setTimeout(r,0));const archive=c.sync({checkpoint:true});release();await Promise.all([poll,archive]);assert.equal(requests.filter(p=>p.checkpoint).length,1);await c.stop();
});

test('three members see independent creative work and a producer restore without changing source script',async()=>{
 const f=fixture(),clients=[];
 for(let i=0;i<3;i++){let project={id:'p'+i,masterScript:original.script,...structuredClone(original)};const c=createDirectorRealtime({readProject:()=>project,applyProject:d=>{project={...project,...d,masterScript:d.script}},call:f.call});await c.start();clients.push({c,read:()=>project,edit:fields=>{project={...project,episodes:[{...project.episodes[0],...fields}]}}});}
 clients[0].edit({quickSceneEdits:{'1-1':'人工分段修改'}});clients[1].edit({sceneVisions:{'1-1':'从低角度看人物'}});clients[2].edit({prompts:[{id:'r1',content:'成果提示词',generationMode:'creative'}],manualSceneReplies:[{id:'raw1',sceneLabel:'1-1',output:'付费原始回包'}]});
 for(let i=0;i<2;i++)await Promise.all(clients.map(x=>x.c.sync()));const chosen=readDocument(f.server);
 for(const x of clients){assert.deepEqual(x.read().episodes,chosen.episodes);assert.equal(x.read().masterScript,original.script);}
 clients[0].edit({quickSceneEdits:{'1-1':'之后改动'}});await clients[0].c.sync();f.restore(chosen);
 for(const x of clients){await x.c.sync();assert.equal(x.read().episodes[0].quickSceneEdits['1-1'],'人工分段修改');assert.equal(x.read().episodes[0].sceneVisions['1-1'],'从低角度看人物');assert.equal(x.read().episodes[0].prompts[0].content,'成果提示词');await x.c.stop();}
});

test('an independently seeded cache is archived and replaced, never merged or uploaded to the cloud baseline',async()=>{
 const f=fixture(),detached=seedDocument({...original,name:original.name.repeat(2)}),saved={state:encode64(Y.encodeStateAsUpdate(detached)),savedAt:1,pending:{update:encode64(Y.encodeStateAsUpdate(detached)),updateId:crypto.randomUUID()},changeCount:1};let project={...original,masterScript:original.script},cache=saved;const archives=[];
 const c=createDirectorRealtime({readProject:()=>project,applyProject:d=>{project={...project,...d,masterScript:d.script}},load:async()=>cache,save:async v=>{cache=v},call:f.call,archiveLocal:async v=>archives.push(v)});await c.start();await c.sync();assert.equal(f.seen.size,0);assert.equal(project.name,original.name);assert.equal(archives.length,2);assert.equal(archives[0].document.name,original.name.repeat(2));assert.equal(cache.epoch,documentEpoch(f.server));await c.stop();
});
test('offline edits from before a producer restore stay in a local version and cannot re-enter the chosen shared history',async()=>{
 const f=fixture();let project={...original,masterScript:original.script};const archives=[];const c=createDirectorRealtime({readProject:()=>project,applyProject:d=>{project={...project,...d,masterScript:d.script}},call:f.call,archiveLocal:async v=>archives.push(v)});await c.start();project={...project,masterScript:'未发送的付费创作稿'};f.restore({...original,script:'制片采用的历史'});await c.sync();await c.sync();assert.equal(project.masterScript,'制片采用的历史');assert.equal(readDocument(f.server).script,'制片采用的历史');assert.equal(f.seen.size,0);assert.equal(archives.at(-1).document.script,'未发送的付费创作稿');await c.stop();
});
test('repair pause never reports synced and preview does not alter the local project',async()=>{
 let project={...original,masterScript:original.script},stage,requests=[];const c=createDirectorRealtime({readProject:()=>project,applyProject:()=>assert.fail('preview must not apply'),status:s=>{stage=s},call:async p=>{requests.push(p);return {repairRequired:true,myRole:'producer',locked:false,summary:{revision:'4',fingerprint:'digest'},...(p.repair==='preview'?{document:original}:{})};}});await c.start();assert.equal(stage,'repair');assert.equal(c.ready(),false);const preview=await c.repair('preview');assert.deepEqual(preview.document,original);assert.equal(requests.some(p=>p.update),false);await c.stop();
});

test('a newer offline cache and stale project file are both recoverable when the producer changes the baseline',async()=>{
 const f=fixture();const oldDoc=new Y.Doc();Y.applyUpdate(oldDoc,Y.encodeStateAsUpdate(f.server));editDocument(oldDoc,original,{...original,script:'CACHE ONLY UNSENT DRAFT'});const cached={state:encode64(Y.encodeStateAsUpdate(oldDoc)),changeCount:1,savedAt:10};f.restore({...original,script:'producer restored'});let project={...original,masterScript:original.script};const versions=[];const c=createDirectorRealtime({readProject:()=>project,applyProject:d=>{project={...project,...d,masterScript:d.script}},load:async()=>cached,call:f.call,archiveLocal:async v=>versions.push(v)});await c.start();assert.equal(project.masterScript,'producer restored');assert.ok(versions.some(v=>v.document.script==='CACHE ONLY UNSENT DRAFT'));assert.ok(versions.some(v=>v.document.script===original.script));await c.sync();assert.equal(f.seen.size,0);await c.stop();
});

test('revocation during an in-flight poll preserves typing made after the request in both view and local cache',async()=>{
 const f=fixture();let project={...original,masterScript:original.script},cached,deny,hold=false;const c=createDirectorRealtime({readProject:()=>project,applyProject:d=>{project={...project,...d,masterScript:d.script}},save:async d=>{cached=d},call:async p=>{if(hold)return new Promise((resolve,reject)=>{deny=()=>reject(Object.assign(Error('您已不在协作项目'),{status:403}))});return f.call(p)}});await c.start();hold=true;const poll=c.sync();while(!deny)await new Promise(r=>setTimeout(r,0));project={...project,masterScript:'TYPED WHILE REQUEST IN FLIGHT'};deny();await poll;assert.equal(project.masterScript,'TYPED WHILE REQUEST IN FLIGHT');const saved=new Y.Doc();Y.applyUpdate(saved,decode64(cached.state));assert.equal(readDocument(saved).script,project.masterScript);await c.stop();
});

test('polls during Chinese IME composition release the request slot and synchronization resumes after input ends',async()=>{
 const f=fixture();let project={...original,masterScript:original.script},composing=false;const c=createDirectorRealtime({readProject:()=>project,applyProject:d=>{project={...project,...d,masterScript:d.script}},call:f.call,flush:()=>!composing});await c.start();composing=true;await c.sync();composing=false;project={...project,masterScript:'输入法结束后继续协作'};await c.sync();await c.sync();assert.equal(readDocument(f.server).script,project.masterScript);assert.ok(f.calls()>1);await c.stop();
});

test('sequential newer file and older offline cache edits resume collaboration with both versions retained',async()=>{
 const f=fixture(),d=new Y.Doc();Y.applyUpdate(d,Y.encodeStateAsUpdate(f.server));editDocument(d,original,{...original,script:'earlier local draft'});const cached={state:encode64(Y.encodeStateAsUpdate(d)),fileBase:original,savedAt:10,changeCount:1};let project={...original,masterScript:'newer local draft',updatedAt:new Date(20).toISOString()};const versions=[];const c=createDirectorRealtime({readProject:()=>project,applyProject:v=>{project={...project,...v,masterScript:v.script}},call:f.call,load:async()=>cached,archiveLocal:async v=>versions.push(v)});await c.start();assert.equal(c.ready(),true);assert.equal(project.masterScript,'newer local draft');assert.ok(versions.some(v=>v.document.script==='earlier local draft'));await c.sync();assert.equal(readDocument(f.server).script,'newer local draft');await c.stop();
});
