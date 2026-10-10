import test from 'node:test';import assert from 'node:assert/strict';
import {Y,seedDocument,readDocument,editDocument,encode64,decode64} from '../cloud-backend/shared/directorSharedDocument.mjs';
import {createDirectorRealtime} from './directorRealtime.js';
import {versionPreviewPages} from './versionPreview.js';
const original={name:'五人协作',script:'原稿',episodes:[{id:'episode',content:'1-1 街道 日 外\n人物：甲\n甲：你好',prompts:[]}],style:'真人电影级',aspectRatio:'16:9'};
function fixture(){const server=seedDocument(original),seen=new Set();let online=true,calls=0;
 const call=async p=>{calls++;if(!online)throw Error('offline');if(p.update&&!seen.has(p.updateId)){Y.applyUpdate(server,decode64(p.update));seen.add(p.updateId);}return {update:encode64(Y.encodeStateAsUpdate(server,p.vector?decode64(p.vector):undefined)),vector:encode64(Y.encodeStateVector(server)),ack:p.updateId,locked:false,myRole:'collaborator'};};
 return {server,call,seen,online:value=>{online=value},calls:()=>calls};
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
