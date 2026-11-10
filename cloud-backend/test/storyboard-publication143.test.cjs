const test=require('node:test'),assert=require('node:assert/strict');
const {patchShot,mergeDirectorEpisodes}=require('../src/storyboard-merge.cjs');
const {handleAction}=require('../src/collab.cjs');
const ep=()=>[{id:'ep',episodeNumber:1,content:'1-1 房间 日 内',prompts:[{id:'s',label:'1-1-1',content:'原稿'}]}];
const publish=()=>({operation:'publish',episodeNumber:1,sceneIds:['1-1'],publicationId:'pub',prompts:[{id:'s',label:'1-1-1',content:'清单核实版本',generationConfig:{references:[{id:'img',kind:'image'}]}}]});
test('legacy initialization and later director editions cannot rewrite published working storyboards',()=>{
 let rows=mergeDirectorEpisodes([],ep());const incoming=ep();incoming[0].promptEditionId='new';incoming[0].prompts[0].content='未分发的新稿';rows=mergeDirectorEpisodes(rows,incoming);
 assert.equal(rows[0].storyboardPrompts[0].content,'原稿');assert.equal(rows[0].prompts[0].content,'未分发的新稿');
 rows=patchShot(rows,publish());rows=patchShot(rows,{editPolicy:'direct',episodeId:'ep',shotId:'s',storyboardPublicationId:'pub',base:{content:'过期内容'},updates:{content:'分镜手改'}});
 assert.equal(rows[0].storyboardPrompts[0].content,'分镜手改');assert.equal(rows[0].prompts[0].content,'未分发的新稿');
 assert.equal(patchShot(rows,publish())[0].storyboardPrompts[0].content,'分镜手改','same receipt is idempotent');
 assert.equal(patchShot(rows,{...publish(),publicationId:'next'})[0].storyboardPrompts[0].content,'清单核实版本');
});
test('publication and direct saves retain separate membership permissions and project lock enforcement',async()=>{
 let writes=0;const repo=role=>({getProject:async()=>({id:'p',owner_id:role==='producer'?'u':'owner'}),findMembership:async()=>({role}),isProjectLocked:async()=>false,patchStoryboard:async()=>{writes++;return {id:'p',owner_id:'u'};}});
 for(const role of ['producer','artist','artist_collaborator'])assert.equal((await handleAction('storyboard-patch',{projectId:'p',...publish()},{id:'u'},repo(role))).status,200);
 for(const role of ['collaborator','viewer'])assert.equal((await handleAction('storyboard-patch',{projectId:'p',...publish()},{id:'u'},repo(role))).status,403);
 assert.equal((await handleAction('storyboard-patch',{projectId:'p',editPolicy:'direct'},{id:'u'},repo('artist'))).status,403);
 const locked=repo('producer');locked.isProjectLocked=async()=>true;assert.equal((await handleAction('storyboard-patch',{projectId:'p',...publish()},{id:'u'},locked)).status,423);assert.equal(writes,3);
});
