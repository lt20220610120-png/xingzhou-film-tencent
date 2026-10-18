import test from 'node:test';import assert from 'node:assert/strict';
import {initializeClientDistribution,PROTECTED_DIRECTOR_SKILLS,isProtectedSkill} from './clientDistribution.js';
import {createInitialState,updateSkill,removeSkill} from './projectStore.js';
test('only genuinely new storage gets three metadata-only protected skills and clean edition',()=>{
 const s=createInitialState(),next=initializeClientDistribution(s,{fresh:true});assert.equal(next.skills.length,3);assert.equal(next.clientEdition,'clean-v1');
 for(const key of ['directorProjects','apiProfiles','mediaProfiles','canvases','chatSessions'])assert.deepEqual(next[key],[]);
 for(const skill of next.skills){assert(isProtectedSkill(skill));assert(!skill.content);assert(!skill.files?.length);assert.equal(updateSkill(next,skill.id,{content:'stolen'}).skills.find(x=>x.id===skill.id).content,undefined);assert.equal(removeSkill(next,skill.id).skills.length,3);}
 assert.deepEqual(next.skills.map(s=>s.name),PROTECTED_DIRECTOR_SKILLS.map(s=>s.name));
});
test('existing users retain all projects, private skills and other keys; only requested five FT links are added once',()=>{
 const empty=createInitialState();assert.strictEqual(initializeClientDistribution(empty,{fresh:false}),empty);
 const s={...createInitialState(),skills:[{id:'custom',name:'video-prompt-fast-v8-2',content:'my private rule'}],directorProjects:[{id:'existing'}],mediaProfiles:[{id:'api',apiKey:'fixture'}]};const next=initializeClientDistribution(s,{fresh:false});assert.deepEqual(next.skills,s.skills);assert.deepEqual(next.directorProjects,s.directorProjects);assert.equal(next.mediaProfiles.length,6);assert.equal(next.mediaProfiles[0].apiKey,'fixture');assert.strictEqual(initializeClientDistribution(next,{fresh:false}),next);
});
