import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSceneSnapshot,snapshotMatchesContext,commitQuickSceneRun,sha256Text} from './directorQuickStore.js';
import {deleteDirectorPromptsEverywhere} from './projectStore.js';
import {createQuickGenerationController} from './directorQuickGeneration.js';

export async function fixture(){
 const episode={id:'e',kind:'episode',title:'第1集',content:'1-1：室内\n甲开门。乙微笑。',prompts:[]};
 const project={id:'p',name:'fixture',style:'真人电影集',aspectRatio:'9:16',masterScript:'设定\n第1集\n'+episode.content,episodes:[{id:'s',kind:'setting',content:'设定'},episode]};
 const skill={id:'skill',name:'测试',content:'完整主文件',files:[{path:'rules.md',content:'全部附件'}]};
 const profile={id:'model',provider:'openai',endpoint:'https://example.invalid/v1',model:'test-model',apiKey:'fixture-not-a-real-key'};
 const context={accountId:'account',project,episode,sceneLabel:'1-1',inputText:episode.content,maxDurationSeconds:30,skill,profile};
 const snapshot=await createSceneSnapshot(context);
 const plan={id:'plan',version:1,...snapshot,sourceText:'甲开门。乙微笑。',sceneHeader:'1-1：室内',createdAt:'2026-10-02T00:00:00Z',segments:[
  {id:'seg1',index:1,sourceStart:0,sourceEnd:4,estimatedSeconds:29.2,recommendedDurationSeconds:30},
  {id:'seg2',index:2,sourceStart:4,sourceEnd:8,estimatedSeconds:9.2,recommendedDurationSeconds:10}]};
 const run={id:'run',snapshot,plan,phase:'ready-to-commit',promptIds:['prompt1','prompt2'],commitKey:'run:commit',checks:{audited:true},segmentDrafts:{seg1:{prompt:{label:'1-1-1',content:'提示词1'},baseline:'自然光',validated:true},seg2:{prompt:{label:'1-1-2',content:'提示词2'},baseline:'自然光',validated:true}}};
 return {context,run,state:{accountId:'account',directorProjects:[project],skills:[skill],apiProfiles:[profile]}};
}
test('SHA256 UTF8 fingerprints match platform crypto including multi-block Unicode',()=>{
 for(const text of ['', 'abc','中文😀'.repeat(200)])assert.equal(sha256Text(text),createHash('sha256').update(text).digest('hex'));
});
test('snapshot fingerprints complete attachments and public model configuration, never credentials',async()=>{
 const {context,run}=await fixture();assert.ok(!JSON.stringify(run.snapshot).includes(context.profile.apiKey));
 assert.equal(await snapshotMatchesContext(run.snapshot,{...context,profile:{...context.profile,apiKey:'rotated'}}),true);
 for(const update of [{accountId:'other'},{inputText:'changed'},{project:{...context.project,style:'2D动漫'}},{skill:{...context.skill,files:[{path:'rules.md',content:'changed'}]}},{profile:{...context.profile,model:'other'}}])assert.equal(await snapshotMatchesContext(run.snapshot,{...context,...update}),false);
});
test('atomic commit writes fixed IDs, timing, full plan and active pointer to episode and history once',async()=>{
 const {state,run}=await fixture();const first=commitQuickSceneRun(state,run);assert.equal(first.applied,true);
 const p=first.state.directorProjects[0],ep=p.episodes[1];assert.equal(ep.prompts.length,2);assert.deepEqual(p.promptHistory,ep.prompts);
 assert.equal(ep.prompts[1].recommendedDurationSeconds,10);assert.equal(ep.prompts[1].sourceText.includes('甲开门'),false);
 assert.equal(ep.activeQuickScenePlanIds['1-1'],'plan');assert.equal(ep.quickScenePlans[0].segments[1].id,'seg2');
 const again=commitQuickSceneRun(first.state,run);assert.equal(again.applied,true);assert.equal(again.state,first.state);
 const edited={...first.state,directorProjects:first.state.directorProjects.map(p=>({...p,style:'2D动漫'}))};assert.equal(commitQuickSceneRun(edited,run).applied,true);
});
test('partial commit saves only accepted prompts then final audit promotes the same fixed IDs',async()=>{
 const {state,run}=await fixture();const partialRun={...run,checks:{audited:false},segmentDrafts:{seg1:run.segmentDrafts.seg1}};
 const first=commitQuickSceneRun(state,partialRun,{partial:true});assert.equal(first.applied,true);
 assert.equal(first.state.directorProjects[0].episodes[1].prompts.length,1);
 assert.equal(first.state.directorProjects[0].episodes[1].prompts[0].sceneAuditStatus,'pending');
 assert.equal(commitQuickSceneRun(first.state,partialRun).applied,false);
 const done=commitQuickSceneRun(first.state,run);assert.equal(done.applied,true);
 assert.deepEqual(done.state.directorProjects[0].episodes[1].prompts.map(p=>[p.id,p.sceneAuditStatus]),[['prompt1','passed'],['prompt2','passed']]);
 assert.equal(done.state.directorProjects[0].promptHistory.length,2);
 const deleted=deleteDirectorPromptsEverywhere(first.state,'p',['prompt1']);assert.equal(commitQuickSceneRun(deleted,run).applied,false);
});
test('audit warning still commits locally valid prompts with a visible status',async()=>{
 const {state,run}=await fixture();
 const warningRun={...run,checks:{audited:true},auditWarnings:[{code:'STATE_RESET',segmentIndex:1,message:'灯状态需要复核'}]};
 const result=commitQuickSceneRun(state,warningRun);
 assert.equal(result.applied,true);
 assert.equal(result.state.directorProjects[0].episodes[1].prompts[0].sceneAuditStatus,'warning');
 assert.equal(result.state.directorProjects[0].episodes[1].prompts[0].sceneAuditWarnings[0].code,'STATE_RESET');
});
test('commit rejects missing/stale/locked targets, invalid drafts and tombstones without orphan history',async()=>{
 const {state,run}=await fixture();
 const variants=[{...state,accountId:'other'},{...state,directorProjects:[]},{...state,directorProjects:[{...state.directorProjects[0],episodes:[]}]},{...state,skills:[]},{...state,apiProfiles:[]},{...state,directorProjects:[{...state.directorProjects[0],cloudLocked:true}]},{...state,directorProjects:[{...state.directorProjects[0],episodes:state.directorProjects[0].episodes.map(e=>e.id==='e'?{...e,quickSceneEdits:{'1-1':'new text'}}:e)}]}];
 for(const current of variants){const result=commitQuickSceneRun(current,run);assert.equal(result.applied,false);assert.equal(result.state,current);assert.ok(result.conflict);}
 assert.equal(commitQuickSceneRun(state,{...run,checks:{audited:false}}).applied,false);
 assert.equal(commitQuickSceneRun(state,{...run,segmentDrafts:{...run.segmentDrafts,seg2:{...run.segmentDrafts.seg2,validated:false}}}).applied,false);
 const done=commitQuickSceneRun(state,run).state,deleted=deleteDirectorPromptsEverywhere(done,'p',['prompt1']);
 assert.equal(commitQuickSceneRun(deleted,run).applied,false);assert.equal(deleted.directorProjects[0].promptHistory.length,1);
 assert.equal(commitQuickSceneRun(state,{...run,plan:{...run.plan,sourceText:'甲关门。乙微笑。'}}).applied,false);
});
test('real controller commits 30+10 with preallocated IDs from one whole-scene Skill response',async()=>{
 const fixtureValue=await fixture();let state=fixtureValue.state;const calls=[],files=new Map();
 const controller=createQuickGenerationController({
  getContext:()=>({...fixtureValue.context,project:state.directorProjects[0],episode:state.directorProjects[0].episodes[1],permissions:{canGenerate:true}}),
  checkpoints:{save:async({run})=>files.set(run.id,structuredClone(run)),list:async()=>[...files.values()],load:async({runId})=>files.get(runId)},
  executeText:async({messages})=>messages[0].content.includes('核对')?JSON.stringify({ok:true,issues:[]}):JSON.stringify({segments:[
   {end:{unitId:'u1',prefix:'甲开门。'},timing:{speechSeconds:28,actionSeconds:2,overlapSeconds:0,transitionSeconds:0},startState:'门关闭',endState:'门打开',boundary:'转乙',visualNotes:[]},
   {end:{unitId:'u1'},timing:{speechSeconds:8,actionSeconds:2,overlapSeconds:0,transitionSeconds:0},startState:'门打开',endState:'乙微笑',boundary:'结束',visualNotes:[]}]}),
  executeSkill:async request=>{calls.push(request);return request.expectedLabels.map(label=>`${label}\n【画面内容】\n自然表演。`).join('\n\n');},
  commitRun:async run=>{const result=commitQuickSceneRun(state,run);state=result.state;return result;},
 });
 const run=await controller.start(fixtureValue.context);assert.equal(run.phase,'completed');
 assert.deepEqual(state.directorProjects[0].episodes[1].prompts.map(p=>p.recommendedDurationSeconds),[30,10]);
 assert.deepEqual(state.directorProjects[0].promptHistory.map(p=>p.id),run.promptIds);
 assert.equal(calls.length,1);assert.deepEqual(calls[0].expectedLabels,['1-1-1','1-1-2']);
 assert.match(calls[0].input,/（1）/);assert.match(calls[0].input,/（2）/);
 assert.ok(calls[0].input.includes('甲开门。'));assert.ok(calls[0].input.includes('乙微笑。'));
 await controller.resume(run.id);assert.equal(state.directorProjects[0].promptHistory.length,2);
});
test('duplicate-scene deletion or renumbering cannot reuse an unchanged scene input fingerprint',async()=>{
 const {state,run,context}=await fixture();
 const changedEpisode={...context.episode,content:'1-1：室内\n甲开门。乙微笑。\n1-2：室内\n甲开门。乙微笑。',quickSceneEdits:{'1-1':context.inputText}};
 assert.equal(await snapshotMatchesContext(run.snapshot,{...context,episode:changedEpisode}),false);
 const changedState={...state,directorProjects:[{...context.project,episodes:context.project.episodes.map(ep=>ep.id===changedEpisode.id?changedEpisode:ep)}]};
 assert.equal(commitQuickSceneRun(changedState,run).applied,false);
});
