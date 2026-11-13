import test from 'node:test';
import assert from 'node:assert/strict';
import {createDirectorManualController,commitManualSceneRun} from './directorManualGeneration.js';
import {createQuickGenerationController} from './directorQuickGeneration.js';
import {commitQuickSceneRun} from './directorQuickStore.js';
import {beginDirectorSceneGeneration,currentManualSceneReplies} from './directorGenerationSession.js';
import {directorSourceOwnership} from './directorCreative.js';
import {parseDirectorOwnershipReview} from './directorOwnershipReview.js';
import {mergeCloudEpisodes} from './directorCloudProjects.js';
import {seedDocument,readDocument} from '../cloud-backend/shared/directorSharedDocument.mjs';
import {newDirectorPromptEdition,switchDirectorPromptEdition} from './directorPromptEditions.js';
import {executeSkillWithAi} from './skillExecution.js';
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};};
const source='9-3 客厅 日 内\n（1）\n甲：给现金。\n乙：要钥匙。\n甲：不要拆台。\n乙：别再吹牛。\n（2）\n甲：都是一家人。\n乙：金镯和养老存折。\n甲：这是棺材本。\n（3）\n乙：原来您分得清。';
function setup({review,generate,auto=false,beginFailure=false}={}){
 let state={accountId:'a',skills:[{id:'s',name:'客户任意Skill',content:'正文格式由附件规定。',files:Array.from({length:8},(_,n)=>({path:`ref/${n}.md`,content:`完整附件${n}`}))}],apiProfiles:[{id:'m',model:'mock'}],directorProjects:[{id:'p',episodes:[{id:'e',content:source,prompts:[{id:'old',label:'9-3-1',sceneLabel:'9-3',generationMode:'quick',generationRunId:'old-run',content:'OLD_REPLY_SENTINEL',sourceText:source},{id:'other',label:'9-4-1',content:'OTHER_SCENE'}],manualSceneReplies:[{id:'old-run',sceneLabel:'9-3',output:'OLD_REPLY_SENTINEL'}]}]}]};
 state.directorProjects[0].episodes.unshift(...Array.from({length:8},(_,n)=>({id:'prior-'+n,content:`${n+1}-1 其他场景 日 内\n背景。`})));
 state.directorProjects[0].episodes.at(-1).content='9-1 前场 日 内\n背景。\n9-2 前场 日 内\n背景。\n'+source;
 const records=new Map(),calls=[];let commitFailure=false;
 const context=()=>({accountId:state.accountId,project:state.directorProjects[0],episode:state.directorProjects[0].episodes.at(-1),sceneLabel:'9-3',inputText:source,skill:state.skills[0],profile:state.apiProfiles[0],maxDurationSeconds:30,pace:100,permissions:{canGenerate:true}});
 const commit=async(run,partial=false)=>{if(commitFailure){commitFailure=false;return{applied:false,conflict:'模拟保存失败'};}const next=auto?commitQuickSceneRun(state,run,{partial}):commitManualSceneRun(state,run);state=next.state;return next;};
 const beginRun=async run=>{if(beginFailure)throw Error('磁盘写入失败');const next=beginDirectorSceneGeneration(state,run);state=next.state;return next;};
 const api={aiChat:async payload=>{calls.push(payload);return review(payload);}};
 const deps={getContext:context,beginRun,checkpoints:{save:async({run})=>records.set(run.id,structuredClone(run)),load:async({runId})=>structuredClone(records.get(runId)),list:async()=>[...records.values()]},
  executeSkill:async payload=>{calls.push(payload);return generate?generate(payload,calls.length):payload.expectedLabels.map(label=>`${label}\nNEW_REPLY_${calls.length}`).join('\n\n');},commitRun:commit};
 const controller=auto?createQuickGenerationController({...deps,editorialPlanning:true,groundedTiming:true,executeText:async()=>'{"estimatedSceneSeconds":30}',commitProgress:run=>commit(run,true)}):createDirectorManualController({...deps,...(review?{reviewSkill:payload=>executeSkillWithAi({api,state,skillId:'s',input:payload.input,beforeUserMessages:payload.beforeUserMessages,assistantRole:'逐段复核Agent'})}:{})});
 return {controller,context,calls,records,commit,api,get state(){return state;},setCommitFailure:()=>commitFailure=true};
}

test('every fresh manual generation clears the current scene before the request and archives previous text',async()=>{
 const hold=gate(),entered=gate();const f=setup({generate:async(p,n)=>{entered.resolve();if(n===1)await hold.promise;return p.expectedLabels.map(label=>`${label}\nNEW_REPLY_${n}`).join('\n\n');}});
 const work=f.controller.start(f.context());await entered.promise;
 assert.equal(f.state.directorProjects[0].episodes.at(-1).prompts.some(p=>p.label.startsWith('9-3-')),false);
 assert(f.state.directorProjects[0].promptHistory.some(p=>p.id==='old'));assert(f.state.directorProjects[0].episodes.at(-1).prompts.some(p=>p.id==='other'));
 assert(!JSON.stringify(f.calls[0]).includes('OLD_REPLY_SENTINEL'));hold.resolve();const first=await work;assert.equal(first.phase,'completed');
 const second=await f.controller.start(f.context());assert.equal(second.phase,'completed');assert.notEqual(second.id,first.id);assert.equal(f.calls.length,2);
 const project=f.state.directorProjects[0],episode=project.episodes.at(-1);assert(episode.prompts.filter(p=>p.label.startsWith('9-3-')).every(p=>p.generationRunId===second.id&&p.content.includes('NEW_REPLY_2')));
 assert(project.promptHistory.some(p=>p.generationRunId===first.id));assert(currentManualSceneReplies(episode,'9-3').every(r=>r.id===second.id));
 const before=f.calls.length;const old=await f.controller.resume(first.id);assert.equal(old.phase,'completed');assert.equal(f.calls.length,before);assert(episode.prompts.filter(p=>p.label.startsWith('9-3-')).every(p=>p.generationRunId===second.id));
});

test('fresh automatic runs use new calls and no prior saved response or preserved prompt context',async()=>{
 const f=setup({auto:true});const a=await f.controller.start(f.context()),b=await f.controller.start(f.context());
 assert.equal(a.phase,'completed',JSON.stringify(a.errors));assert.equal(b.phase,'completed',JSON.stringify(b.errors));assert.notEqual(a.id,b.id);assert.equal(f.calls.length,2);
 for(const call of f.calls){assert(!JSON.stringify(call).includes('OLD_REPLY_SENTINEL'));assert.equal(call.preservedPrompts.length,0);assert(!call.beforeUserMessages.length);}
 assert(f.state.directorProjects[0].episodes.at(-1).prompts.filter(p=>p.sceneLabel==='9-3').every(p=>p.generationRunId===b.id));
});

test('continuation reuses a paid reply, while a fresh run supersedes that continuation',async()=>{
 const f=setup();f.setCommitFailure();const failed=await f.controller.start(f.context());assert.equal(failed.phase,'stale');assert.equal(f.calls.length,1);
 const resumed=await f.controller.resume(failed.id);assert.equal(resumed.phase,'completed');assert.equal(f.calls.length,1);
 await f.controller.start(f.context());const rejected=await f.commit(resumed);assert.equal(rejected.applied,false);assert.match(rejected.conflict,/新的生成批次/);
});

test('a late stopped reply cannot refill the freshly cleared current generation',async()=>{
 const hold=gate(),entered=gate();const f=setup({generate:async(p,n)=>{if(n===1){entered.resolve();await hold.promise;}return p.expectedLabels.map(label=>`${label}\nRUN_${n}`).join('\n\n');}});
 const first=f.controller.start(f.context());await entered.promise;const old=f.controller.entries()[0];await f.controller.stop(old.id);
 const second=await f.controller.start(f.context());hold.resolve();await first;
 assert.equal(second.phase,'completed');assert(f.state.directorProjects[0].episodes.at(-1).prompts.filter(p=>p.sceneLabel==='9-3').every(p=>p.generationRunId===second.id));assert(f.controller.get(old.id).output);
});

test('a failed generation-area checkpoint starts no model request and does not remain busy',async()=>{
 const f=setup({beginFailure:true});const run=await f.controller.start(f.context());assert.equal(run.phase,'failed');assert.equal(f.calls.length,0);assert(f.state.directorProjects[0].episodes.at(-1).prompts.some(p=>p.id==='old'));
});

test('9-3 raw ownership keeps four, three and one lines in their own bracket',()=>{
 const locks=directorSourceOwnership(source,['9-3-1','9-3-2','9-3-3']);
 assert(locks[0].source.includes('不要拆台')&&locks[0].source.includes('别再吹牛'));assert(!locks[1].source.includes('不要拆台'));assert(locks[1].source.includes('都是一家人')&&locks[2].source.includes('原来您分得清'));
});

test('full selected Skill is read again for per-bracket Agent review; Agent corrections are preserved verbatim',async()=>{
 const corrected='9-3-1\n甲：给现金。乙：要钥匙。甲：不要拆台。乙：别再吹牛。\n自定义比重 hold';
 const crossed=['9-3-1\n甲：给现金。乙：要钥匙。','9-3-2\n甲：不要拆台。乙：别再吹牛。甲：都是一家人。乙：金镯和养老存折。甲：这是棺材本。','9-3-3\n乙：原来您分得清。'].join('\n\n');
 const second='9-3-2\n甲：都是一家人。乙：金镯和养老存折。甲：这是棺材本。';
 const f=setup({generate:()=>crossed,review:payload=>{assert(payload.messages.some(m=>String(m.content).includes('棺材本')));for(let n=0;n<8;n++)assert(payload.messages.some(m=>String(m.content).includes(`完整附件${n}`)));assert(payload.messages.some(m=>String(m.content).includes('逐段原文归属')));return JSON.stringify({segments:['9-3-1','9-3-2','9-3-3'].map(label=>({label,ok:true,issues:[],...(label==='9-3-1'?{correctedContent:corrected}:label==='9-3-2'?{correctedContent:second}:{})}))});}});
 const run=await f.controller.start(f.context());assert.equal(run.phase,'completed',JSON.stringify(run.errors));assert.equal(f.calls.length,2);assert.equal(run.originalOutput,crossed);assert(run.reviewOutput);assert.equal(run.prompts[0].content,corrected);assert.equal(run.prompts[1].content,second);assert.equal(run.prompts[2].content,'9-3-3\n乙：原来您分得清。');
 assert(f.state.directorProjects[0].episodes.at(-1).prompts.find(p=>p.label==='9-3-1').content.includes('自定义比重 hold'));
});

test('a rejected Agent review stays visible with warning and is never silently passed or regenerated',async()=>{
 const f=setup({review:()=>JSON.stringify({segments:['9-3-1','9-3-2','9-3-3'].map((label,n)=>({label,ok:n!==1,issues:n===1?['混入上一段对白']:[]}))})});
 const run=await f.controller.start(f.context());assert.equal(run.phase,'needs-review');assert.equal(f.calls.length,2);const warning=f.state.directorProjects[0].episodes.at(-1).prompts.find(p=>p.label==='9-3-2');assert.equal(warning.sceneAuditStatus,'warning');assert(warning.content);
 await f.controller.resume(run.id);assert.equal(f.calls.length,2,'cached review is retained, no automatic paid loop');
});

test('manual edits made while Agent review is in flight survive a corrected reply',async()=>{
 let f;const changed='9-3-1\n用户手工编辑';f=setup({review:()=>{const p=f.state.directorProjects[0],ep=p.episodes.at(-1),entry=ep.prompts.find(x=>x.label==='9-3-1');entry.content=changed;p.promptHistory.find(x=>x.id===entry.id).content=changed;return JSON.stringify({segments:['9-3-1','9-3-2','9-3-3'].map(label=>({label,ok:true,issues:[],...(label==='9-3-1'?{correctedContent:'9-3-1\nAgent修订'}:{})}))});}});
 const run=await f.controller.start(f.context());assert.equal(run.phase,'stale');assert.equal(f.state.directorProjects[0].episodes.at(-1).prompts.find(p=>p.label==='9-3-1').content,changed);assert(run.reviewOutput);
});

test('malformed or incomplete review does not become success; protocol imposes no fixed shot fraction',()=>{
 assert.throws(()=>parseDirectorOwnershipReview('{"segments":[]}', ['9-3-1']),/覆盖/);
 assert.throws(()=>parseDirectorOwnershipReview('{"segments":[{"label":"9-3-1","ok":true,"issues":["还没修好"]}]}',['9-3-1']),/无效/);
 const r=parseDirectorOwnershipReview(JSON.stringify({segments:[{label:'9-3-1',ok:true,issues:[],correctedContent:'9-3-1\n客户规则允许7/5为非时长权重'}]}),['9-3-1']);assert.equal(r.length,1);
});

test('current run survives cloud serialization, old snapshots and edition switches',async()=>{
 const f=setup();const run=await f.controller.start(f.context());const project=f.state.directorProjects[0],episode=project.episodes.at(-1),doc={name:'导演',script:'',episodes:[{...episode,promptEditionId:'original:p',promptEditions:[{id:'original:p'}]}]};
 const yd=seedDocument(doc);try{assert.equal(readDocument(yd).episodes[0].activeSceneGenerationRuns['9-3'].runId,run.id);}finally{yd.destroy();}
 const old={id:episode.id,content:episode.content,prompts:[]};assert.equal(mergeCloudEpisodes([episode],[old])[0].activeSceneGenerationRuns['9-3'].runId,run.id);
 const branched=newDirectorPromptEdition({...project,id:'p',name:'导演'},'新版本');
 assert.deepEqual(branched.episodes.at(-1).activeSceneGenerationRuns,{});
 const restored=switchDirectorPromptEdition(branched,'original:p');assert.equal(restored.episodes.at(-1).activeSceneGenerationRuns['9-3'].runId,run.id);
});
