import {creatorInputFingerprint} from './creatorWorkspace.js';import {adoptOutlineVersion} from './rewriteWorldVersions.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeFrameworkProject} from './frameworkWorkflow.js';import {normalizeCreatorProject} from './creatorWorkspace.js';
import {projectWorldSeed,projectWorldPlan,sourceFingerprint,applyWorldStory,putWorld} from './worldSimulationAdapter.js';
import {createWorld,addCandidate,commitCandidate,forkAt} from '../world-simulation/engine.js';
const framework=()=>normalizeFrameworkProject({id:'p',name:'原创',episodes:[{id:'ep',title:'旧正文',result:'不能删除旧正文'}],creator:{mode:'framework',framework:{settings:{confirmed:true,items:[{id:'rule',text:'现代世界'}]},characters:[{id:'hero',name:'新作主角',confirmed:true}],groups:[{id:'old',title:'既有事件',goal:'旧内容',events:[]}]}}});
const completed=p=>{const input=projectWorldSeed(p),w=createWorld(input.seed,{source:{projectId:p.id,fingerprint:sourceFingerprint(p)}});return commitCandidate(addCandidate(w,'main',{id:'r',name:'新路线',events:[{id:'new',title:'相遇',summary:'新作主角遇到朋友',actorIds:['hero'],time:1,effects:[]}]}),'main','r');};
test('framework adoption appends an independently saved simulation and retains existing locked content and bodies',()=>{
 const p=framework(),w=completed(p),next=applyWorldStory(p,w,'main');assert.equal(next.episodes[0].result,'不能删除旧正文');assert.equal(next.creator.framework.groups[0].id,'old');assert.ok(next.creator.framework.groups.some(g=>g.worldProjectId===w.id));assert.ok(next.creator.framework.simulations.length);
 assert.equal(p.creator.framework.groups.length,1);assert.equal(putWorld(p,w).creator.worldSimulation.worlds[0].id,w.id);
});
test('stale source settings reject world writeback without overwriting the work',()=>{
 const p=framework(),w=completed(p);p.creator.framework.settings.items[0].text='世界已变';assert.throws(()=>applyWorldStory(p,w,'main'),/变化/);
});
test('switching adopted framework life back to an older branch retains unique history and all old work',()=>{
 let p=framework(),w=completed(p);p=applyWorldStory(p,w,'main');w=p.creator.worldSimulation.worlds[0];w=forkAt(w,'main','new',{...w.branches[0].events[0],summary:'主角独自出发'},{id:'other'});p=applyWorldStory(p,w,'other');w=p.creator.worldSimulation.worlds[0];p=applyWorldStory(p,w,'main');assert.equal(p.creator.framework.groups.length,2);assert.equal(p.creator.framework.simulations.length,3);assert.equal(p.episodes[0].result,'不能删除旧正文');
});
test('source manuscripts and unaccepted original suggestions do not become initial world facts',()=>{
 const p=framework();p.creator.framework.characters.push({id:'ghost',name:'未采用角色',confirmed:false});p.creator.source={content:'参考书主角是别人'};
 const input=projectWorldSeed(p);assert.equal(input.seed.characters.length,1);assert.ok(!JSON.stringify(input.seed).includes('参考书'));
});
test('existing framework ideas and event plans are author-side guidance and changes invalidate adoption',()=>{
 const p=framework();p.creator.framework.ideas=[{id:'i',content:'已选灵感',included:true},{id:'j',content:'未选想法',included:false}];const plan=projectWorldPlan(p),w=completed(p);
 assert.equal(plan.inspiration.length,1);assert.equal(plan.groups[0].id,'old');assert.equal(w.seed.facts.length,0);p.creator.framework.ideas[0].content='修改的灵感';assert.throws(()=>applyWorldStory(p,w,'main'),/变化/);
});
test('rewrite import uses confirmed canonical people and never material names; missing identity blocks writeback',()=>{
 const p=normalizeCreatorProject({id:'rw',name:'洗稿',mode:'rewrite',episodes:[{id:'ep',result:'旧正文'}],creator:{mode:'rewrite',rewrite:{identity:{accepted:true,people:[{id:'hero',name:'新作主角',role:'femaleLead'}],relations:[],bindings:[],sourceActors:[]}},sections:{settings:{accepted:true,output:'现代都市'},macroOutline:{output:'{"groups":[]}'}}}},'script');p.creator.source={id:'book',name:'原作',content:'原书女主旧名字'};
 const input=projectWorldSeed(p);assert.equal(input.seed.characters[0].name,'新作主角');assert.ok(!JSON.stringify(input.seed).includes('旧名字'));
 const w=completed(p),next=applyWorldStory(p,w,'main');assert.equal(next.episodes[0].result,'旧正文');assert.ok(next.creator.sections.macroOutline.output.includes('新作主角'));const v=next.creator.rewrite.outlineVersions.at(-1);assert.equal(v.inputFingerprint,creatorInputFingerprint(next,v.target));assert.equal(next.creator.rewrite.activeOutlineVersionId,v.id);assert.ok(v.adoptedAt);assert.doesNotThrow(()=>adoptOutlineVersion({scriptProjects:[next]},next.id,v.id));
 let continued=next.creator.worldSimulation.worlds[0];continued=commitCandidate(addCandidate(continued,'main',{id:'r2',name:'再前进',events:[{id:'new2',title:'出发',summary:'新作主角再出发',time:2,actorIds:['hero'],effects:[]}]}),'main','r2');const twice=applyWorldStory(next,continued,'main');assert.equal(JSON.parse(twice.creator.sections.macroOutline.output).groups.length,2);assert.deepEqual(applyWorldStory(twice,twice.creator.worldSimulation.worlds[0],'main'),twice);
 const noIdentity=normalizeCreatorProject({...p,creator:{...p.creator,rewrite:{identity:{accepted:false}}}},'script');assert.throws(()=>applyWorldStory(noIdentity,{...w,source:{projectId:noIdentity.id,fingerprint:sourceFingerprint(noIdentity)}},'main'),/人物/);
});
test('material aliases in event titles cannot be marked as converted canonical new work',()=>{
 const p=normalizeCreatorProject({id:'rw',name:'洗稿',mode:'rewrite',creator:{mode:'rewrite',rewrite:{identity:{accepted:true,people:[{id:'hero',name:'新作主角'}],sourceActors:[{id:'old',sourceId:'book',name:'原书旧名'}],relations:[],bindings:[]}},sections:{settings:{accepted:true,output:'现代'},macroOutline:{output:'{"groups":[]}'}}}},'script');
 let w=createWorld(projectWorldSeed(p).seed,{source:{projectId:p.id,fingerprint:sourceFingerprint(p)}});w=commitCandidate(addCandidate(w,'main',{id:'r',name:'路线',events:[{id:'n',title:'原书旧名相遇',summary:'新作主角向前一步',time:1,actorIds:['hero'],effects:[]}]}),'main','r');assert.throws(()=>applyWorldStory(p,w,'main'),/原名/);
});
