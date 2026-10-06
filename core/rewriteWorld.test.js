import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,normalizeState} from './projectStore.js';
import {createCreatorProject,updateCreatorSection,appendCreatorRecord,creatorInputFingerprint} from './creatorWorkspace.js';
import {addRewriteSource,saveRewriteAnalysis,prepareRewriteTask} from './rewriteWorkflow.js';
import {readWorldCandidate,rewriteWorldInput} from './rewriteWorld.js';
import {addWorldSimulationVersion,adoptOutlineVersion,updateOutlineVersion,saveCurrentOutlineVersion,deleteOutlineVersion,rewriteOutlineVersions} from './rewriteWorldVersions.js';
import {runCreatorTask} from './creatorAi.js';
import {creatorTaskSlot,creatorTaskActivity,creatorTasksConflict} from './creatorTaskSlots.js';

const outline={groups:[{id:'g1',title:'相遇',goal:'从陌生到认识',source:'都市素材 A组',events:[{id:'e1',title:'拾到遗失物',summary:'女主发现包并寻找失主',purpose:'建立联系',source:'都市素材 A1'}]}]};
const candidate={title:'先相爱后相遇',changeSummary:'先网恋，再现实相遇，重组相遇过程。',constraintsCheck:'遵守未来城市设定及女主独立性格；网恋后奔现，因果连贯。',groups:[{id:'ng1',title:'网恋相爱',goal:'从网友成为恋人',source:'重排都市素材B组',events:[{id:'ne1',title:'线上互助',summary:'在网络交流中建立信任',purpose:'先建立感情再现实见面',source:'新创作，衔接先相爱后相遇'}]},{id:'ng2',title:'现实相遇',goal:'从网恋到共同生活',source:'改写都市素材A组',events:[{id:'ne2',title:'现实奔现',summary:'两人在现实见面',purpose:'验证线上相处并引出下一阶段',source:'改写都市素材A1'}]}]};
function fixture(){
 let state=createCreatorProject(createInitialState(),{name:'模拟版本测试',mode:'rewrite'});const id=state.scriptProjects[0].id;
 for(let n=1;n<=2;n++){state=addRewriteSource(state,id,{name:`都市素材${n}`,content:'第1集\n女主捡包。'});const p=state.scriptProjects[0],book=[p.creator.source,...p.creator.references].at(-1);state=saveRewriteAnalysis(state,id,book.id,{macroOutline:outline},'macroOutline');}
 state=updateCreatorSection(state,'script',id,'settings',{output:'新作世界：未来城市，禁止魔法',accepted:true,locked:true});
 state=updateCreatorSection(state,'script',id,'characters',{output:'女主独立，不依附他人',accepted:true});
 state=updateCreatorSection(state,'script',id,'macroOutline',{output:JSON.stringify(outline),accepted:true});
 // Adopting a skeleton asks for rechecking downstream characters; reaffirm it.
 state=updateCreatorSection(state,'script',id,'characters',{accepted:true,stale:false});
 const p=state.scriptProjects[0],target={section:'macroOutline',side:'output',task:'rewriteWorldSim',sourceIds:[p.creator.source.id,...p.creator.references.map(b=>b.id)],baseVersionId:'current',scope:'project'};
 return {state,id,target};
}
function addVersion(f,recordId='sim-1'){
 const p=f.state.scriptProjects[0];f.state=appendCreatorRecord(f.state,'script',f.id,{id:recordId,type:'ai',target:f.target,status:'pending',output:JSON.stringify(candidate),inputFingerprint:creatorInputFingerprint(p,f.target),worldInputSnapshot:rewriteWorldInput(p,f.target)});
 f.state=addWorldSimulationVersion(f.state,f.id,recordId);return rewriteOutlineVersions(f.state.scriptProjects[0]).at(-1);
}
test('simulation sees selected event materials and confirmed new constraints, excluding downstream manuscripts',()=>{
 const f=fixture(),p=f.state.scriptProjects[0];p.episodes=[{id:'old',content:'旧集纲，顺序不能作为约束',result:'旧正文'}];p.creator.sections.outline.output='旧逐集内容';p.creator.sections.outline.accepted=true;
 const prepared=prepareRewriteTask(p,f.target);
 assert.equal(prepared.episodes.length,0);assert.equal(prepared.creator.references.length,2);assert.equal(prepared.creator.source,null);
 assert.equal(prepared.creator.sections.settings.output,'新作世界：未来城市，禁止魔法');assert.equal(prepared.creator.sections.characters.output,'女主独立，不依附他人');
 assert.equal(prepared.creator.sections.outline,undefined);assert.equal(prepared.creator.sections.macroOutline.accepted,false);
 assert.throws(()=>prepareRewriteTask(p,{...f.target,sourceIds:[]}),/至少一本/);
 assert.throws(()=>prepareRewriteTask(p,{...f.target,sourceIds:['missing']}),/未拆解/);
});
test('version creation and manual edits preserve current manuscript and persist across reload',()=>{
 const f=fixture(),before=f.state.scriptProjects[0].creator.sections.macroOutline.output,v=addVersion(f);
 const edited=structuredClone(candidate);edited.groups[0].title='人工改成先互相了解';
 f.state=updateOutlineVersion(f.state,f.id,v.id,{output:JSON.stringify(edited.groups?{groups:edited.groups}:edited),name:'人工满意版'});
 assert.equal(f.state.scriptProjects[0].creator.sections.macroOutline.output,before);
 const reloaded=normalizeState(JSON.parse(JSON.stringify(f.state))),version=rewriteOutlineVersions(reloaded.scriptProjects[0])[0];
 assert.equal(version.name,'人工满意版');assert.match(version.output,/人工改成/);assert.equal(version.originalOutput,JSON.stringify(candidate));
});
test('validation and committed simulation save use the same version identity',()=>{
 const f=fixture(),p=f.state.scriptProjects[0];
 f.state=appendCreatorRecord(f.state,'script',f.id,{id:'same-run',type:'ai',target:f.target,status:'pending',output:JSON.stringify(candidate),inputFingerprint:creatorInputFingerprint(p,f.target)});
 const preview=addWorldSimulationVersion(f.state,f.id,'same-run'),committed=addWorldSimulationVersion(f.state,f.id,'same-run');
 assert.equal(rewriteOutlineVersions(preview.scriptProjects[0])[0].id,rewriteOutlineVersions(committed.scriptProjects[0])[0].id);
 assert.equal(rewriteOutlineVersions(addWorldSimulationVersion(committed,f.id,'same-run').scriptProjects[0]).length,1);
});
test('adoption retains old outline, marks downstream for review, and can restore independent versions',()=>{
 const f=fixture(),v=addVersion(f);f.state=adoptOutlineVersion(f.state,f.id,v.id);
 assert.match(f.state.scriptProjects[0].creator.sections.macroOutline.output,/网恋相爱/);assert.equal(f.state.scriptProjects[0].creator.sections.macroOutline.accepted,true);
 assert.equal(f.state.scriptProjects[0].creator.sections.characters.stale,true);
 assert.equal(rewriteOutlineVersions(f.state.scriptProjects[0]).length,2);
 assert.throws(()=>deleteOutlineVersion(f.state,f.id,v.id),/当前采用/);
 const backup=rewriteOutlineVersions(f.state.scriptProjects[0]).find(v=>v.name==='采用前的大纲备份');
 assert.throws(()=>adoptOutlineVersion(f.state,f.id,backup.id),/复核/);
 f.state=adoptOutlineVersion(f.state,f.id,backup.id,{allowStale:true});assert.match(f.state.scriptProjects[0].creator.sections.macroOutline.output,/拾到遗失物/);
 assert.equal(rewriteOutlineVersions(f.state.scriptProjects[0]).find(i=>i.id===v.id).output,JSON.stringify({groups:candidate.groups}));
});
test('constraint and selected material edits invalidate candidates; unrelated output and versions do not',()=>{
 const f=fixture(),v=addVersion(f),p=f.state.scriptProjects[0],fingerprint=creatorInputFingerprint(p,f.target);
 const copied=structuredClone(p);copied.creator.sections.outline.output='人工改了旧主线';copied.creator.rewrite.outlineVersions.push({id:'other',output:'another'});
 assert.equal(creatorInputFingerprint(copied,f.target),fingerprint);
 copied.creator.source.analysis.macroOutline.groups[0].title='不同素材';assert.notEqual(creatorInputFingerprint(copied,f.target),fingerprint);
 f.state=updateCreatorSection(f.state,'script',f.id,'settings',{locked:false});
 f.state=updateCreatorSection(f.state,'script',f.id,'settings',{output:'新设定：现实都市',accepted:true});
 assert.throws(()=>adoptOutlineVersion(f.state,f.id,v.id),/复核/);
 f.state=adoptOutlineVersion(f.state,f.id,v.id,{allowStale:true});assert.match(f.state.scriptProjects[0].creator.sections.settings.output,/现实都市/);
});
test('manual snapshots and previous candidate versions can be used as simulation starting points',()=>{
 const f=fixture();f.state=saveCurrentOutlineVersion(f.state,f.id);const saved=rewriteOutlineVersions(f.state.scriptProjects[0])[0];
 const target={...f.target,baseVersionId:saved.id},p=f.state.scriptProjects[0];
 assert.equal(rewriteWorldInput(p,target,{strict:true}).baseOutline,saved.output);
 assert.equal(rewriteWorldInput(p,{...target,baseVersionId:'sources'}).baseOutline,'');
 assert.throws(()=>prepareRewriteTask(p,{...target,baseVersionId:'missing'}),/起点/);
 p.creator.rewrite.worldConfig={baseVersionId:saved.id};
 f.state=deleteOutlineVersion(f.state,f.id,saved.id);assert.equal(f.state.scriptProjects[0].creator.rewrite.worldConfig.baseVersionId,'current');
});
test('incomplete provenance and invalid drafts cannot be adopted; locked new outline is protected',()=>{
 const missing=structuredClone(candidate);missing.groups[0].events[0].source='';assert.throws(()=>readWorldCandidate(missing),/来源/);
 const f=fixture(),v=addVersion(f);f.state=updateCreatorSection(f.state,'script',f.id,'macroOutline',{locked:true});
 assert.throws(()=>adoptOutlineVersion(f.state,f.id,v.id,{allowStale:true}),/锁定/);
 f.state=updateOutlineVersion(f.state,f.id,v.id,{output:JSON.stringify({groups:[]})});
 f.state=updateCreatorSection(f.state,'script',f.id,'macroOutline',{locked:false});assert.throws(()=>adoptOutlineVersion(f.state,f.id,v.id,{allowStale:true}),/补齐/);
});
test('mock model receives recombination rule, new confirmed setting and selected sources only',async()=>{
 const f=fixture();const p=f.state.scriptProjects[0];p.creator.references[0].analysis.macroOutline.groups[0].title='不选择的素材';
 let request;const result=await runCreatorTask({api:{aiChat:async req=>{request=req;return JSON.stringify(candidate);}},state:f.state,project:p,target:{...f.target,sourceIds:[p.creator.source.id]},profile:{id:'mock',model:'mock',endpoint:'mock'},instruction:'先网恋，后奔现'});
 const prompt=request.messages.map(m=>m.content).join('\n');assert.match(prompt,/先网恋/);assert.match(prompt,/未来城市，禁止魔法/);assert.match(prompt,/女主独立/);assert.match(prompt,/新创作与理由/);assert.doesNotMatch(prompt,/不选择的素材/);assert.equal(readWorldCandidate(result.output).outline.groups.length,2);
});
test('world simulation reports its own activity and shares macro draft destination without blocking analysis',()=>{
 const target={section:'macroOutline',task:'rewriteWorldSim'},analysis={section:'rewriteAnalysis',task:'rewriteAnalyze',analysisStage:'macroOutline',sourceId:'book'};
 const activity={[creatorTaskSlot('script','p',analysis,true)]:{running:true,target:analysis}};
 assert.equal(creatorTaskActivity(activity,'script','p',target).running,false);assert.equal(creatorTasksConflict(target,analysis),false);
 assert.equal(creatorTasksConflict(target,{section:'macroOutline'}),true);
});
