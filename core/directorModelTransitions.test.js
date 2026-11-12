import test from 'node:test';
import assert from 'node:assert/strict';
import {createSceneSnapshot,commitQuickSceneRun} from './directorQuickStore.js';

test('a continuous A to B to C model transition publishes the original plan and IDs, broken chains do not',async()=>{
 const episode={id:'ep',title:'第1集',content:'1-1 室内\n甲开门。乙微笑。'};
 const project={id:'p',episodes:[episode]},skill={id:'skill',content:'完整Skill'};
 const profiles=['A','B','C'].map(id=>({id,model:id}));
 const context={accountId:'a',project,episode,sceneLabel:'1-1',inputText:episode.content,maxDurationSeconds:30,skill};
 const [a,b,c]=await Promise.all(profiles.map(profile=>createSceneSnapshot({...context,profile})));
 const plan={id:'plan',...a,sourceText:'甲开门。乙微笑。',sceneHeader:'1-1 室内',segments:[{id:'segment',index:1,sourceStart:0,sourceEnd:8,estimatedSeconds:10,recommendedDurationSeconds:10}]};
 const run={id:'run',snapshot:c,plan,promptIds:['prompt'],commitKey:'run',checks:{audited:true},segmentDrafts:{segment:{validated:true,prompt:{label:'1-1-1',content:'完整已付费回包'}}},profileTransitions:[{from:a.profileHash,to:b.profileHash},{from:b.profileHash,to:c.profileHash}]};
 const state={accountId:'a',directorProjects:[project],skills:[skill],apiProfiles:profiles};
 const saved=commitQuickSceneRun(state,run);assert.equal(saved.applied,true,saved.conflict);
 assert.equal(saved.state.directorProjects[0].episodes[0].prompts[0].id,'prompt');assert.deepEqual(saved.state.directorProjects[0].episodes[0].quickScenePlans[0],plan);
 for(const steps of [[],[{from:a.profileHash,to:b.profileHash}],[{from:b.profileHash,to:c.profileHash}],[{from:a.profileHash,to:'unrelated'},{from:b.profileHash,to:c.profileHash}]])assert.equal(commitQuickSceneRun(state,{...run,profileTransitions:steps}).applied,false);
});
