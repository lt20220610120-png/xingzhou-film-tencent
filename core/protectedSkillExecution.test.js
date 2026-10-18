import test from 'node:test';import assert from 'node:assert/strict';
import {executeSkillWithAi} from './skillExecution.js';import {initializeClientDistribution} from './clientDistribution.js';import {createInitialState} from './projectStore.js';import {identifyPromptContract} from './directorPromptValidation.js';
test('new protected skills send only ID and scene/director input to the existing authenticated AI bridge',async()=>{
 const state=initializeClientDistribution(createInitialState(),{fresh:true});const skill=state.skills[0];let sent;
 const r=await executeSkillWithAi({state,skillId:skill.id,input:'完整整场戏与导演构想',profile:{id:'p',endpoint:'https://api.openai.com/v1',model:'fixture',apiKey:'fixture'},api:{aiChat:async p=>{sent=p;return '最终提示词';}}});
 assert.equal(sent.builtinSkillId,skill.id);assert.equal(sent.skillInput,'完整整场戏与导演构想');assert.equal(sent.messages.length,1);assert.equal(r.output,'最终提示词');assert.equal(identifyPromptContract(skill),'fast-v8');
 await assert.rejects(executeSkillWithAi({state,skillId:skill.id,input:'scene',profile:{endpoint:'https://attacker.example/v1',model:'x',apiKey:'fixture'},api:{aiChat:()=>{throw Error('must not call')}}}),/已审核/);
});
