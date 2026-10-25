import test from 'node:test';
import assert from 'node:assert/strict';
import {runContinuousArtAnalysis} from './artContinuousAnalysis.js';
import {artScriptFingerprint} from './artScriptContext.js';
import {artEpisodeReady} from './artWorkflow.js';
import {reviewRoster,editArtReview,decodeArtReviewOutput} from './artReview.js';
import {getArtReviewStore} from './artReviewPersistence.js';

function fixture({later=true,voice=true}={}){
 const project={id:crypto.randomUUID(),episodes:[
  {episodeNumber:1,title:'第1集',content:voice?'1-1 面包车 日 内\n波斯猫主人 VO（急切）：我家猫不吃饭了。李大川接听电话。':'1-1 宠物店 日 内\n波斯猫主人站在门口，说猫不吃饭了。'},
  {episodeNumber:2,title:'第2集',content:later?'2-1 宠物店 日 内\n波斯猫主人走进门，是一位四十岁女性，圆脸，黑色短发，声音低沉。她穿着蓝色外套。':'2-1 街道 日 外\n李大川离开。'},
  {episodeNumber:3,title:'第3集',content:'3-1 公园 日 外\n李大川牵着狗。'},
 ]};
 let disk={episodes:{},scriptContext:{signature:artScriptFingerprint(project),complete:true,genre:'现代都市'}},calls=[],job={};
 const inventory=n=>`### 第${n}集\n人物：\n${n===1?'- 【波斯猫主人-家常便装】（首次）':n===2&&later?'- 【波斯猫主人-外套】主体类型：人类；四十岁女性，圆脸，黑色短发，声音低沉；服装：蓝色外套。':'- 无'}\n场景：\n- 无\n道具：\n- 无\n【逐场资产对应表】\n${JSON.stringify({scenes:[{sceneId:`${n}-1`,assets:n===2&&later?[{category:'character',name:'【波斯猫主人-外套】'}]:[]}]})}`;
 const api={artReviewLoadLocal:async()=>structuredClone(disk),artReviewSaveLocal:async p=>{disk=structuredClone(p.data)},analysisLoad:async()=>null,aiChat:async p=>{
  const data=(()=>{try{return JSON.parse(p.messages[1].content).untrustedData}catch{return null}})();
  if(data?.requestedItems){
   const backfill=!!data.laterEvidence?.length;calls.push(backfill?'backfill:1':'detail:1');
   return {ok:true,output:JSON.stringify({items:data.requestedItems.map(i=>backfill?{id:i.id,category:i.category,name:i.name,visible:false,reason:'第1集仅有电话声音；第2集明确人物性别、年龄与声音。',voiceDescription:'四十岁女性，声音低沉',evidence:[{episodeNumber:2,quote:'是一位四十岁女性，圆脸，黑色短发，声音低沉。'}]}:{id:i.id,category:i.category,name:i.name,visible:false})})};
  }
  const n=Number(p.messages[0].content.match(/当前输出只包含第(\d+)集/)[1]);calls.push(`inventory:${n}`);return {ok:true,output:inventory(n)};
 }};
 let retries=0;
 return {project,api,job,profile:{id:'mock'},calls,waitForRetry:async()=>{if(++retries>10)throw Error('test: unbounded detail retry')},get disk(){return disk}};
}
test('three failed detail attempts defer the voice and later evidence backfills before continuing forward',async()=>{
 const f=fixture();const result=await runContinuousArtAnalysis(f);
 assert.deepEqual(f.calls,['inventory:1','detail:1','detail:1','detail:1','inventory:2','backfill:1','inventory:3']);
 assert.equal(result.workflow.phase,'complete');assert.deepEqual(result.errors,[]);
 const r=f.disk.episodes[1],item=reviewRoster(r)[0];assert.equal(item.detailStatus,'nonvisual');assert.match(item.voiceDescription,/四十岁女性/);assert.equal(item.description,'');
 assert.equal(r.scenes[0].items.length,0,'later visible appearance does not create an earlier visible asset');
 assert.equal(r.detailDeferrals[item.id].status,'resolved');assert.equal(r.detailDeferrals[item.id].attempts,3);assert.equal(item.detailEvidence[0].episodeNumber,2);
});
test('full script without evidence finishes with a persistent unresolved marker, not fabricated detail or repeated requests',async()=>{
 const f=fixture({later:false}),result=await runContinuousArtAnalysis(f);const r=f.disk.episodes[1],item=reviewRoster(r)[0];
 assert.equal(f.calls.filter(x=>x==='detail:1').length,3);assert.equal(result.workflow.phase,'complete');assert.equal(result.workflow.deferredCount,1);
 assert.equal(r.detailDeferrals[item.id].status,'unresolved');assert.equal(artEpisodeReady(r,f.project.episodes[0]),false);assert.equal(item.ready,false);
 const count=f.calls.length;await runContinuousArtAnalysis(f);assert.equal(f.calls.length,count,'same source without new evidence does not incur repeated AI requests');
});
test('stop and resume retain per-card attempt counts',async()=>{
 const f=fixture({later:false});let waits=0;f.waitForRetry=async()=>{if(++waits===2)f.job.cancelled=true;};
 await runContinuousArtAnalysis(f);assert.equal(f.calls.filter(x=>x==='detail:1').length,2);
 f.job.cancelled=false;f.waitForRetry=async()=>{if(++waits>10)throw Error('test: resumed unbounded retry')};await runContinuousArtAnalysis(f);assert.equal(f.calls.filter(x=>x==='detail:1').length,3);
});
test('invalid later citations are retained once, never invented or repeatedly retried at the end',async()=>{
 const f=fixture(),original=f.api.aiChat;f.api.aiChat=async p=>{const r=await original(p);if(p.messages[1].content.includes('laterEvidence')){const data=JSON.parse(r.output);data.items[0].evidence[0].quote='不存在的依据';r.output=JSON.stringify(data);}return r;};
 await runContinuousArtAnalysis(f);const item=reviewRoster(f.disk.episodes[1])[0];assert.equal(item.detailStatus,undefined);assert.equal(f.disk.episodes[1].detailDeferrals[item.id].status,'unresolved');assert.equal(f.calls.filter(c=>c==='backfill:1').length,1);
 await runContinuousArtAnalysis(f);assert.equal(f.calls.filter(c=>c==='backfill:1').length,1);
});
test('a later visible wardrobe cannot turn a deferred phone voice into an earlier visible card',async()=>{
 const f=fixture(),original=f.api.aiChat;f.api.aiChat=async p=>{const r=await original(p);if(p.messages[1].content.includes('laterEvidence')){const data=JSON.parse(r.output);Object.assign(data.items[0],{visible:true,description:'四十岁女性，圆脸，蓝色外套。',sceneIds:['1-1']});r.output=JSON.stringify(data);}return r;};
 await runContinuousArtAnalysis(f);const r=f.disk.episodes[1],item=reviewRoster(r)[0];assert.equal(item.description,'');assert.equal(r.scenes[0].items.length,0);assert.equal(r.detailDeferrals[item.id].status,'unresolved');
});
test('human edits made during later backfill survive the returned result',async()=>{
 const f=fixture(),original=f.api.aiChat;f.api.aiChat=async p=>{const r=await original(p);if(p.messages[1].content.includes('laterEvidence')){
  const store=getArtReviewStore({api:f.api,projectId:f.project.id});await store.update(1,record=>editArtReview(record,{type:'roster-upsert',itemId:reviewRoster(record)[0].id,item:{...reviewRoster(record)[0],note:'用户明确：不要推断性别',ready:false}}));f.job.cancelled=true;
 }return r;};
 await runContinuousArtAnalysis(f);const item=reviewRoster(f.disk.episodes[1])[0];assert.equal(item.note,'用户明确：不要推断性别');assert.equal(item.voiceDescription,undefined);assert.equal(item.manual,true);
});
test('failed persistence never advances to the next episode or converts an unsaved deferral into success',async()=>{
 const f=fixture(),save=f.api.artReviewSaveLocal;f.api.artReviewSaveLocal=async p=>{if(Object.values(p.data.episodes[1]?.detailDeferrals||{}).some(x=>x.status==='waiting'))throw Error('disk full');return save(p);};
 await assert.rejects(runContinuousArtAnalysis(f),/disk full/);assert.ok(!f.calls.includes('inventory:2'));
});
test('a previously unresolved voice is not the first visible appearance anchor for the same named card later',async()=>{
 const f=fixture(),original=f.api.aiChat;f.api.aiChat=async p=>{const r=await original(p);if(f.calls.at(-1)==='inventory:2')r.output=r.output.replaceAll('波斯猫主人-外套','波斯猫主人-家常便装');return r;};
 await runContinuousArtAnalysis(f);assert.equal(reviewRoster(f.disk.episodes[2])[0].firstEpisode,2);
});
test('changed later source is reread and can resolve a prior final unresolved marker',async()=>{
 const f=fixture(),original=f.api.aiChat;let hasEvidence=false;
 f.api.aiChat=async p=>{const r=await original(p);if(!hasEvidence&&p.messages[1].content.includes('laterEvidence')){const data=JSON.parse(r.output);data.items[0].evidence[0].quote='未找到';r.output=JSON.stringify(data);}return r;};
 await runContinuousArtAnalysis(f);assert.equal(f.calls.filter(c=>c==='backfill:1').length,1);
 hasEvidence=true;f.project.episodes[1].content+='\n波斯猫主人：我是昨天给你打电话的。';
 const store=getArtReviewStore({api:f.api,projectId:f.project.id});await store.setContext({signature:artScriptFingerprint(f.project),complete:true,genre:'现代都市'});
 await runContinuousArtAnalysis(f);assert.equal(f.calls.filter(c=>c==='backfill:1').length,2);assert.equal(reviewRoster(f.disk.episodes[1])[0].detailStatus,'nonvisual');
});
test('empty replies still preserve source VO visibility when later appearance is available',async()=>{
 const f=fixture(),original=f.api.aiChat;f.api.aiChat=async p=>{const r=await original(p);if(f.calls.at(-1)==='detail:1')return {output:'{"items":[]}'};if(f.calls.at(-1)==='backfill:1'){const d=JSON.parse(r.output);Object.assign(d.items[0],{visible:true,description:'四十岁女性，圆脸，蓝外套。',currentEvidence:[{quote:'波斯猫主人 VO（急切）：我家猫不吃饭了。'}]});r.output=JSON.stringify(d);}return r;};
 await runContinuousArtAnalysis(f);const item=reviewRoster(f.disk.episodes[1])[0];assert.equal(item.description,'');assert.equal(f.disk.episodes[1].detailDeferrals[item.id].status,'unresolved');
});
test('incomplete later repairs do not change the pending card or reset its three-attempt budget',async()=>{
 const f=fixture({voice:false}),original=f.api.aiChat;let changed=0;
 f.api.aiChat=async p=>{const r=await original(p);if(f.calls.at(-1)==='detail:1')return {output:'{"items":[]}'};if(f.calls.at(-1)==='backfill:1'){const d=JSON.parse(r.output);Object.assign(d.items[0],{visible:true,description:'服装：蓝色外套。版本'+(++changed),currentEvidence:[{quote:'波斯猫主人站在门口'}]});r.output=JSON.stringify(d);}return r;};
 await runContinuousArtAnalysis(f);const item=reviewRoster(f.disk.episodes[1])[0];assert.equal(item.description,'');assert.equal(f.calls.filter(x=>x==='detail:1').length,3);assert.equal(changed,1);assert.ok(f.calls.includes('inventory:3'));
 await runContinuousArtAnalysis(f);assert.equal(changed,1);
});
test('changing target source invalidates old attempt counters even when inventory name and description stay identical',async()=>{
 const f=fixture({later:false});await runContinuousArtAnalysis(f);
 f.project.episodes[0].content+='\n电话里的声音低沉，来自一位四十岁女性。';const store=getArtReviewStore({api:f.api,projectId:f.project.id});await store.setContext({signature:artScriptFingerprint(f.project),complete:true,genre:'现代都市'});
 const original=f.api.aiChat;f.api.aiChat=async p=>{const r=await original(p);if(f.calls.at(-1)==='detail:1'){const d=JSON.parse(r.output);d.items[0].reason='本集仅电话声音，新增原文已明确身份';r.output=JSON.stringify(d);}return r;};
 await runContinuousArtAnalysis(f);assert.equal(f.calls.filter(x=>x==='detail:1').length,4);assert.equal(reviewRoster(f.disk.episodes[1])[0].detailStatus,'nonvisual');
});
test('resolved backfill is invalidated when cited source changes and gets the new evidence',async()=>{
 const f=fixture();await runContinuousArtAnalysis(f);
 f.project.episodes[1].content=f.project.episodes[1].content.replace('四十岁女性','二十岁男性');const store=getArtReviewStore({api:f.api,projectId:f.project.id});await store.setContext({signature:artScriptFingerprint(f.project),complete:true,genre:'现代都市'});
 const original=f.api.aiChat;f.api.aiChat=async p=>{const r=await original(p);if(f.calls.at(-1)==='backfill:1'){const d=JSON.parse(r.output);d.items[0].voiceDescription='二十岁男性，声音低沉';d.items[0].evidence[0].quote='是一位二十岁男性，圆脸，黑色短发，声音低沉。';r.output=JSON.stringify(d);}return r;};
 await runContinuousArtAnalysis(f);assert.equal(f.calls.filter(x=>x==='backfill:1').length,2);assert.match(reviewRoster(f.disk.episodes[1])[0].voiceDescription,/二十岁男性/);
});
test('target episode changed after successful voice backfill restores the pending card for its new visible occurrence',async()=>{
 const f=fixture();await runContinuousArtAnalysis(f);
 f.project.episodes[0].content='1-1 面包车 日 内\n波斯猫主人站在车门边，是个二十岁男人，圆脸，穿红色夹克。';const store=getArtReviewStore({api:f.api,projectId:f.project.id});await store.setContext({signature:artScriptFingerprint(f.project),complete:true,genre:'现代都市'});
 const original=f.api.aiChat;f.api.aiChat=async p=>{const r=await original(p);if(f.calls.at(-1)==='detail:1'){const d=JSON.parse(r.output);Object.assign(d.items[0],{visible:true,description:'二十岁男人，圆脸，穿红色夹克。'});r.output=JSON.stringify(d);}return r;};
 await runContinuousArtAnalysis(f);const item=reviewRoster(f.disk.episodes[1])[0];assert.equal(item.detailStatus,undefined);assert.equal(item.voiceDescription,undefined);assert.match(item.description,/二十岁男人/);assert.equal(f.calls.filter(c=>c==='detail:1').length,4);
});
test('a character who appears visually and as VO in the same episode may use explicit current visible evidence',async()=>{
 const f=fixture({voice:false});f.project.episodes[0].content+='\n波斯猫主人 VO：我得赶回家。';const store=getArtReviewStore({api:f.api,projectId:f.project.id});await store.load(f.project);await store.setContext({signature:artScriptFingerprint(f.project),complete:true,genre:'现代都市'});
 const original=f.api.aiChat;f.api.aiChat=async p=>{const r=await original(p);if(f.calls.at(-1)==='detail:1')return {output:'{"items":[]}'};if(f.calls.at(-1)==='backfill:1'){const d=JSON.parse(r.output);Object.assign(d.items[0],{visible:true,description:'四十岁女性，圆脸，穿蓝色外套。',currentEvidence:[{quote:'波斯猫主人站在门口'}]});r.output=JSON.stringify(d);}return r;};
 await runContinuousArtAnalysis(f);const item=reviewRoster(f.disk.episodes[1])[0];assert.equal(item.ready,true);assert.equal(f.disk.episodes[1].detailDeferrals[item.id].status,'resolved');
});
test('explicit model reuse of a voice-only earlier card cannot make it the visible appearance anchor',()=>{
 const result=decodeArtReviewOutput('### 第2集\n人物：\n- 【猫主人-常服】（复用自第1集）\n场景：\n- 无\n道具：\n- 无',2,[{id:'c',name:'【猫主人-常服】',category:'character',detailStatus:'nonvisual',description:'',ready:false,firstEpisode:1}]);
 assert.equal(result.items[0].firstEpisode,2);assert.equal(result.items[0].ready,false);
});
