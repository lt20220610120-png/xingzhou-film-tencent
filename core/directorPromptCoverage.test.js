import test from 'node:test';
import assert from 'node:assert/strict';
import {directorPromptCoverage} from './directorPromptCoverage.js';
const prompt=(label,extra={})=>({id:label,label,content:'已保存并展示的提示词',...extra});
test('an activity status cannot hide a missing manual tail or a whole missing scene',()=>{
 const project={episodes:[{id:'setting',kind:'setting',content:'人物设定'},{id:'ep',status:'已生成提示词',content:'1-1 房间 日 内\n（1）\n甲开门。\n（2）\n甲离开。\n1-2 走廊 日 内\n甲挥手。',prompts:[prompt('1-1-1')]}]};
 let coverage=directorPromptCoverage(project);assert.equal(coverage.length,1);assert.equal(coverage[0].complete,false);assert.deepEqual(coverage[0].scenes.map(s=>s.missingLabels),[['1-1-2'],['1-2-1']]);
 project.episodes[1].prompts.push(prompt('1-1-2'),prompt('1-2-1'));coverage=directorPromptCoverage(project);assert.equal(coverage[0].complete,true);assert.equal(coverage[0].count,3);
 project.episodes[1].prompts[1].content=' ';assert.equal(directorPromptCoverage(project)[0].complete,false);
 project.episodes[1].prompts[1].content='1-1-2';assert.equal(directorPromptCoverage(project)[0].complete,false);
});
test('only the active automatic plan counts, including unsaved, truncated and duplicate segments',()=>{
 const ep={id:'ep',content:'1-1 房间 日 内\n甲开门。',activeQuickScenePlanIds:{'1-1':'plan'},quickScenePlans:[{id:'plan',segments:[{index:1},{index:2}]}],prompts:[prompt('1-1-1',{segmentationPlanId:'plan'}),prompt('1-1-2',{segmentationPlanId:'old'})]};
 const project={episodes:[ep]};assert.deepEqual(directorPromptCoverage(project)[0].scenes[0].missingLabels,['1-1-2']);
 ep.prompts.push(prompt('1-1-2',{id:'new',segmentationPlanId:'plan',generationComplete:false}));assert.equal(directorPromptCoverage(project)[0].complete,false);
 ep.prompts[2].generationComplete=true;assert.equal(directorPromptCoverage(project)[0].complete,true);
 ep.prompts.push(prompt('1-1-2',{id:'duplicate',segmentationPlanId:'plan'}));assert.equal(directorPromptCoverage(project)[0].complete,false);
 ep.prompts.pop();ep.quickScenePlans[0].sourceSnapshot='旧原文';assert.equal(directorPromptCoverage(project)[0].complete,false);
});
test('empty scripts and a newly added episode are never complete',()=>{
 const project={episodes:[{id:'e',content:''}]};assert.equal(directorPromptCoverage(project)[0].complete,false);
 project.episodes[0]={id:'e',content:'1-1 房间 日 内\n甲开门。',prompts:[prompt('1-1-1')]};assert.equal(directorPromptCoverage(project).every(e=>e.complete),true);
 project.episodes.push({id:'two',content:'2-1 房间 夜 内\n甲关门。'});assert.equal(directorPromptCoverage(project).every(e=>e.complete),false);
});

test('calibrated plans count as complete, and an empty current run cannot reuse a prior reply',async()=>{
 const {directorSettingsHash,directorSceneInput}=await import('./directorQuickStore.js');
 const ep={id:'ep',title:'第1集',content:'1-1 房间 日 内\n甲开门。',activeQuickScenePlanIds:{'1-1':'plan'},activeSceneGenerationRuns:{'1-1':{runId:'new'}},prompts:[
  prompt('1-1-1',{id:'new-prompt',generationRunId:'new',segmentationPlanId:'plan'}),
  prompt('1-1-1',{id:'old-prompt',generationRunId:'old',segmentationPlanId:'old-plan'})
 ]},project={episodes:[ep]},maxDurationSeconds=31,timingScale=.7,pace=-100;
 ep.quickScenePlans=[{id:'plan',segments:[{index:1}],maxDurationSeconds,pace,editorialBudget:{timingScale},sourceSnapshot:directorSceneInput(project,ep,'1-1'),settingsHash:directorSettingsHash({project,episode:ep,maxDurationSeconds,pace,timingScale})}];
 assert.equal(directorPromptCoverage(project)[0].complete,true);
 ep.activeSceneGenerationRuns['1-1'].runId='empty';
 assert.equal(directorPromptCoverage(project)[0].complete,false);
 assert.equal(directorPromptCoverage(project)[0].count,0);
});
