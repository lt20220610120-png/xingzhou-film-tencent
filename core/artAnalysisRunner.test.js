import test from 'node:test';import assert from 'node:assert/strict';
import {runArtAnalysis,splitAnalysisText,validateArtOutput,buildExistingAssetContext} from './artAnalysisRunner.js';
import {ART_RUNTIME_SKILL,COLLAB_ART_SKILL} from './collabArtSkill.js';
const output=n=>`### 第${n}集\n人物：\n- 【角色${n}】（首次）五官、完整服装\n场景：\n无（本段未出现）\n道具：\n无（本段未出现）`;
function fixture(count=75){let disk=null;const calls=[],published=[];const profile={id:'chosen',name:'所选接口',model:'chosen-model',endpoint:'https://chosen.example/v1',apiKey:'chosen-key'};
 const args={project:{id:'p',episodes:Array.from({length:count},(_,i)=>({title:`第${i+1}集`,content:'剧本'}))},genre:'都市',profile,job:{},load:async()=>structuredClone(disk),save:async v=>{disk=structuredClone(v);},api:{aiChat:async p=>{calls.push(p);const n=Number(p.messages.at(-1).content.match(/现在分析第(\d+)集/)[1]);return {ok:true,output:output(n)};},collabPublishAnalysis:async p=>published.push(p)}};
 return {args,calls,published,get disk(){return disk;}};
}
test('75 episodes: failure at 26 preserves first 25; resume calls only unfinished and captures selected endpoint/key/model',async()=>{
 const f=fixture();const original=f.args.api.aiChat;f.args.api.aiChat=async p=>{if(f.calls.length===25){f.calls.push(p);return {ok:false,error:'模型只返回了推理过程',partialText:''};}return original(p);};
 await assert.rejects(runArtAnalysis(f.args),/推理/);assert.equal(f.published.length,25);assert.ok(f.disk.episodes[25].published);
 f.args.api.aiChat=original;await runArtAnalysis({...f.args,job:{}});assert.equal(f.calls.length,76);assert.equal(f.published.length,75);
 for(const p of f.calls){assert.equal(p.model,'chosen-model');assert.equal(p.apiKey,'chosen-key');assert.equal(p.endpoint,'https://chosen.example/v1');assert.equal(p.profileId,'chosen');assert.ok(p.messages[0].content.includes(ART_RUNTIME_SKILL));assert.match(p.messages[0].content,/当前输出/);}
});
test('cloud save failure retries saved content without another paid request',async()=>{
 const f=fixture(3);f.args.api.collabPublishAnalysis=async()=>{throw new Error('offline');};const result=await runArtAnalysis(f.args);assert.equal(result.pending,3);assert.equal(f.calls.length,3);
 f.args.api.collabPublishAnalysis=async()=>{};await f.args.job.sync();assert.equal(f.calls.length,3);assert.equal(f.args.job.pending,0);
});
test('changed episode invalidates only its own checkpoint; original input is split without omission',async()=>{
 const f=fixture(2);await runArtAnalysis(f.args);f.args.project.episodes[1].content='修改剧本';await runArtAnalysis(f.args);assert.equal(f.calls.length,3);
 const text=('原文段落\n'.repeat(1600));const pieces=splitAnalysisText(text);assert.equal(pieces.join(''),text);assert.equal(pieces.length,1);
 const bounded=splitAnalysisText(text,2400);assert.equal(bounded.join(''),text);assert.ok(bounded.every(p=>p.length<=2401));assert.match(ART_RUNTIME_SKILL,/人物/);assert.ok(COLLAB_ART_SKILL.includes(ART_RUNTIME_SKILL));
});
test('no successful result marked on malformed/truncated content; partial output kept for review',async()=>{
 const f=fixture(1);f.args.api.aiChat=async()=>({ok:false,error:'模型输出被截断',partialText:'部分正文'});await assert.rejects(runArtAnalysis(f.args),/截断/);assert.equal(f.disk.episodes[1].failure.partialText,'部分正文');assert.equal(f.published.length,0);
});

test('target episode uses preserved metadata identity and never pays for earlier episodes',async()=>{
 let disk=null;const calls=[],published=[],notices=[],job={};
 const args={
  project:{id:'p-gap',episodes:[{kind:'setting',title:'设定和小传',content:'设定'},{episodeNumber:19,title:'第十九集',content:'旧剧本'},{episodeNumber:20,title:'第二十集',content:'新增剧本'}]},
  targetEpisodeNumbers:[20],genre:'都市',profile:{id:'chosen',name:'所选接口',model:'chosen-model'},job,onProgress:()=>notices.push(job.notice),
  load:async()=>structuredClone(disk),save:async value=>{disk=structuredClone(value);},
  api:{aiChat:async payload=>{calls.push(payload);return {ok:true,output:output(20)};},collabPublishAnalysis:async payload=>published.push(payload)},
 };
 const result=await runArtAnalysis(args);
 assert.equal(result.completed,1);assert.equal(result.total,1);assert.equal(calls.length,1);
 assert.match(calls[0].messages.at(-1).content,/第20集/);assert.match(calls[0].messages.at(-1).content,/新增剧本/);
 assert.ok(notices.some(notice=>notice?.includes('第 20 集 · 目标 1/1')));
 assert.deepEqual(published.map(item=>item.episodeNumber),[20]);assert.ok(disk.episodes[20]);assert.equal(disk.episodes[19],undefined);
});

test('single episode receives complete relevant asset continuity as context, never as assistant history',async()=>{
 const description='脸型骨相清晰；眉眼鼻唇固定；当前服装状态：白衬衣、深蓝长裤、银色腕表。';
 let disk={episodes:{19:{fingerprint:'legacy-v4',chunks:['旧剧本'],outputs:[`### 第19集\n人物：\n- 【姜蓝-旧礼服】（实际出镜，首次）脸型：椭圆；五官：清晰；服装：旧礼服\n场景：\n无（本段未出现）\n道具：\n无（本段未出现）`],published:true}}};
 const calls=[];
 await runArtAnalysis({
  project:{id:'p-context',episodes:[{episodeNumber:19,title:'第十九集',content:'旧剧本'},{episodeNumber:20,title:'第二十集',content:'姜蓝回到家中。'}]},
  targetEpisodeNumbers:[20],existingAssets:[{id:'asset-1',name:'【姜蓝-白衣常服】',category:'character',first_episode:1,episodes:[1,19],description}],
  genre:'都市',profile:{id:'chosen',name:'所选接口',model:'chosen-model'},job:{},load:async()=>structuredClone(disk),save:async value=>{disk=structuredClone(value);},
  api:{aiChat:async payload=>{calls.push(payload);return {ok:true,output:output(20)};},collabPublishAnalysis:async()=>{}},
 });
 const messages=calls[0].messages;const context=messages.map(message=>message.content).join('\n');
 assert.match(context,/【姜蓝-白衣常服】/);assert.match(context,/首次集数：1/);assert.match(context,/当前服装状态：白衬衣、深蓝长裤、银色腕表/);
 assert.match(context,/【姜蓝-旧礼服】/);assert.equal(messages.some(message=>message.role==='assistant'),false);
});

test('large asset libraries keep relevant early anchors complete in bounded context',()=>{
 const assets=Array.from({length:2000},(_,index)=>({name:`【路人${index}-常服】`,category:'character',first_episode:1,episodes:[1],description:'普通描述'.repeat(20)}));
 assets[0]={name:'【姜蓝-基准造型】',category:'character',first_episode:1,episodes:[1,19],description:'关键脸型五官和当前服装状态'.repeat(80)};
 const context=buildExistingAssetContext(assets,{episodeNumber:701,content:'姜蓝回到家中。'});
 assert.match(context,/【姜蓝-基准造型】/);assert.match(context,/关键脸型五官和当前服装状态/);assert.ok(context.length<30000);
});

test('output validation rejects any cross-episode content',()=>{
 assert.throws(()=>validateArtOutput(`${output(19)}\n\n${output(20)}`,20),/只允许返回第 20 集/);
 assert.throws(()=>validateArtOutput(`${output(20)}\n\n第二十一集\n人物：\n无（本集未识别到该类资产）\n场景：\n无（本集未识别到该类资产）\n道具：\n无（本集未识别到该类资产）`,20),/只允许返回第 20 集/);
 assert.throws(()=>validateArtOutput(`${output(20)}\n\n21-1 家 夜 内`,20),/只允许返回第 20 集/);
 assert.equal(validateArtOutput(output(20),20)[0].episodes[0],20);
});

test('scene assets are limited to real current-episode scene headings and lighting-only time cards',()=>{
 const source='20-1 出租屋客厅 日 内\n姜蓝从卧室拿出枕头。';
 const result=`### 第20集\n人物：\n- 无（本集未识别到该类资产）\n场景：\n- 【出租屋客厅-内】（首次）空间布局：一室客厅\n- 【出租屋客厅-夜-内】（参考【出租屋客厅-内】）时间/光线：夜间暖灯\n- 【出租屋客厅-清晨-内】（参考【出租屋客厅-内】）空间布局：改成豪华套房\n- 【卧室-夜-内】（首次）床头柜和床铺\n道具：\n- 无（本集未识别到该类资产）`;
 const rows=validateArtOutput(result,20,source);
 assert.deepEqual(rows.filter(row=>row.category==='scene').map(row=>row.name),['【出租屋客厅-内】','【出租屋客厅-夜-内】']);
 assert.ok(rows.validationWarnings.some(message=>/卧室/.test(message)));
 const noHeading=validateArtOutput(result,20,'姜蓝回到家中。');
 assert.equal(noHeading.some(row=>row.category==='scene'),false);assert.match(noHeading.validationWarnings.join('\n'),/没有可识别场次头/);
});

test('runner preserves raw output but publishes only source-backed scene assets',async()=>{
 let disk=null;const published=[];const raw=`### 第20集\n人物：\n- 无（本集未识别到该类资产）\n场景：\n- 【出租屋客厅-内】（首次）空间布局：客厅\n- 【卧室-夜-内】（首次）床铺\n道具：\n- 无（本集未识别到该类资产）`;
 const result=await runArtAnalysis({project:{id:'scene-filter',episodes:[{episodeNumber:20,title:'第20集',content:'20-1 出租屋客厅 日 内\n姜蓝走进卧室。'}]},targetEpisodeNumbers:[20],genre:'都市',profile:{id:'p',name:'模型',model:'m'},job:{},load:async()=>structuredClone(disk),save:async value=>{disk=structuredClone(value);},api:{aiChat:async()=>({ok:true,output:raw}),collabPublishAnalysis:async payload=>published.push(payload)}});
 assert.doesNotMatch(published[0].output,/卧室-夜-内/);assert.deepEqual(published[0].assets.filter(row=>row.category==='scene').map(row=>row.name),['【出租屋客厅-内】']);
 assert.match(disk.episodes[20].outputs[0],/卧室-夜-内/);assert.ok(result.warnings.some(message=>/卧室/.test(message)));
});

test('analysis chunking keeps a normal complete episode together and prefers scene boundaries',()=>{
 const normalEpisode=`20-1 家中 日 内\n${'正文'.repeat(2000)}`;
 assert.equal(splitAnalysisText(normalEpisode).length,1);
 const scenes=`20-1 家中 日 内\n${'甲'.repeat(45)}\n20-2 街道 夜 外\n${'乙'.repeat(45)}\n20-3 医院 日 内\n${'丙'.repeat(45)}`;
 const chunks=splitAnalysisText(scenes,80);
 assert.equal(chunks.join(''),scenes);assert.ok(chunks.slice(1).every(chunk=>/^20-[23]/.test(chunk)));
});

test('a V4 remote fingerprint remains legacy baseline without default paid V5 reanalysis',async()=>{
 const episode={episodeNumber:20,title:'第二十集',content:'新增剧本'};
 const bytes=new TextEncoder().encode(JSON.stringify(['art-v4-bounded-1','都市',episode.title,episode.content]));
 const legacyFingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
 const calls=[];let disk=null;
 await runArtAnalysis({project:{id:'p-v5',episodes:[episode],analysis_progress:{20:{fingerprint:legacyFingerprint,output:output(20)}}},targetEpisodeNumbers:[20],genre:'都市',profile:{id:'chosen',name:'所选接口',model:'chosen-model'},job:{},load:async()=>disk,save:async value=>{disk=structuredClone(value);},api:{aiChat:async payload=>{calls.push(payload);return {ok:true,output:output(20)};},collabPublishAnalysis:async()=>{}}});
 assert.equal(calls.length,0);assert.equal(disk.episodes[20].fingerprint,legacyFingerprint);
 assert.equal(disk.episodes[20].legacyBaseline,true);
});

test('complete paid V4 local output can publish without another model request',async()=>{
 const episode={episodeNumber:20,title:'第二十集',content:'新增剧本'};
 const bytes=new TextEncoder().encode(JSON.stringify(['art-v4-bounded-1','都市',episode.title,episode.content]));
 const fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
 let disk={episodes:{20:{fingerprint,chunks:[episode.content],outputs:[output(20)],published:false}}};const calls=[],published=[];
 const result=await runArtAnalysis({project:{id:'p-legacy-pending',episodes:[episode]},targetEpisodeNumbers:[20],genre:'都市',profile:{id:'chosen',name:'所选接口',model:'chosen-model'},job:{},load:async()=>structuredClone(disk),save:async value=>{disk=structuredClone(value);},api:{aiChat:async payload=>{calls.push(payload);return {ok:true,output:output(20)};},collabPublishAnalysis:async payload=>published.push(payload)}});
 assert.equal(calls.length,0);assert.equal(published.length,1);assert.equal(result.pending,0);assert.equal(disk.episodes[20].published,true);
});

test('default single-episode resume is free while explicit force archives the paid log before rerun',async()=>{
 const f=fixture(1);f.args.project.episodes[0]={episodeNumber:20,title:'第二十集',content:'新增剧本'};
 f.args.api.aiChat=async payload=>{f.calls.push(payload);return {ok:true,output:output(20)};};
 await runArtAnalysis({...f.args,targetEpisodeNumbers:[20]});
 await runArtAnalysis({...f.args,targetEpisodeNumbers:[20],job:{}});
 assert.equal(f.calls.length,1);
 f.args.project.analysis_progress={20:{fingerprint:f.disk.episodes[20].fingerprint,output:f.disk.episodes[20].outputs[0]}};
 await runArtAnalysis({...f.args,targetEpisodeNumbers:[20],force:true,job:{}});
 assert.equal(f.calls.length,2);assert.equal(f.disk.history[20].length,1);assert.match(f.disk.history[20][0].outputs[0],/第20集/);
 });

test('incremental requests receive real project biographies without analyzing the setting unit',async()=>{
 const f=fixture(1);
 const biography='人物小传：觉白是主角；阮林是仅一次过场的次要接待员，不为轻微擦伤新建造型。';
 f.args.project.episodes=[{id:'bio',kind:'setting',title:'设定和小传',content:biography},{id:'e20',episodeNumber:20,title:'第20集',content:'20-1 出租屋 日 内\n觉白与阮林交谈。'}];
 const before=structuredClone(f.args.project);
 await runArtAnalysis({...f.args,targetEpisodeNumbers:[20]});
 assert.equal(f.calls.length,1);
 assert.ok(f.calls[0].messages.some(message=>message.role==='user'&&message.content.includes(biography)));
 assert.ok(!f.calls[0].messages[0].content.includes(biography));
 assert.doesNotMatch(f.calls[0].messages.at(-1).content,/人物小传：觉白/);
 assert.deepEqual(f.published.map(item=>item.episodeNumber),[20]);
 assert.deepEqual(f.args.project,before);
});

test('revisiting an early episode uses the latest prior wardrobe occurrence, never a future occurrence',()=>{
 const context=buildExistingAssetContext([
  {name:'【觉白-常服】',category:'character',first_episode:1,episodes:[1,5,20],description:'服装：原常服'},
  {name:'【觉白-礼服】',category:'character',first_episode:6,episodes:[6,19],description:'服装：新礼服'},
 ],{episodeNumber:6,content:'觉白仍穿上一集的同一套衣服。'});
 assert.ok(context.includes('- 【觉白-常服】｜当前服装状态候选'));
 assert.ok(!context.includes('- 【觉白-礼服】｜当前服装状态候选'));
});

test('real script scene field labels do not become part of the physical location name',()=>{
 const source='20-1 景：韩川出租屋 清晨 内\n人物：韩川。';
 const raw='### 第20集\n人物：\n- 无（本集未出现）\n场景：\n- 【韩川出租屋-清晨-内】（参考【韩川出租屋-凌晨-内】）时间光线：清晨，只改变晨光。\n道具：\n- 无（本集未出现）';
 const rows=validateArtOutput(raw,20,source,[{category:'scene',name:'【韩川出租屋-凌晨-内】',first_episode:1,episodes:[1],description:'基准空间'}]);
 assert.deepEqual(rows.map(row=>row.name),['【韩川出租屋-清晨-内】']);
 assert.equal(rows.validationWarnings.length,0);
 assert.equal(source,'20-1 景：韩川出租屋 清晨 内\n人物：韩川。');
});

test('a real dash-separated daylight scene without an interior marker is not silently lost',()=>{
 const source='1-1天竺国度，月银沙漠-白日\n人物：姜蓝。';
 const raw='### 第1集\n人物：\n- 无（本集未出现）\n场景：\n- 【天竺国度月银沙漠-白日-外】（首次，内外推断）空间：沙漠全景；时间光线：白日自然光。\n道具：\n- 无（本集未出现）';
 const rows=validateArtOutput(raw,1,source);
 assert.deepEqual(rows.map(row=>row.name),['【天竺国度月银沙漠-白日-外】']);
 assert.equal(rows.validationWarnings.length,0);
});

test('one unmarked physical scene cannot expand into both inferred interior and exterior assets',()=>{
 const source='1-1天竺国度，月银沙漠-白日\n人物：姜蓝。';
 const raw='### 第1集\n人物：\n- 无（本集未出现）\n场景：\n- 【天竺国度月银沙漠-白日-外】（首次，内外推断）沙漠全景\n- 【天竺国度月银沙漠-白日-内】（首次，内外推断）沙漠室内空间\n道具：\n- 无（本集未出现）';
 const rows=validateArtOutput(raw,1,source);
 assert.deepEqual(rows.map(row=>row.name),['【天竺国度月银沙漠-白日-外】']);
 assert.ok(rows.validationWarnings.some(warning=>/内外/.test(warning)));
});
