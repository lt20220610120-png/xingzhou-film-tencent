const test=require('node:test'),assert=require('node:assert/strict');
const {createCollabService}=require('./collab-service.cjs');

test('the first save shares an accessible voice once and writes portable references for other machines',async()=>{
 const rows=[],uploads=[],saves=[];
 const cloud=createCollabService(()=>({account:{id:'owner'},token:'token'}),{
  verifyStoryboardAudio:async file=>file==='managed/voice.wav'?file:null,
  upload:async (projectId,filePath,kind,token)=>{
   uploads.push({projectId,filePath,kind,token});
   return {objectKey:'projects/p/audio/voice.wav',filename:'voice.wav',kind,mime:'audio/wav'};
  },
  async callGateway(action,payload){
   if(action==='project-get')return {id:'p',myRole:'collaborator'};
   if(action==='media-list')return rows;
   if(action==='media-record'){const row={...payload,id:'audio-record'};rows.push(row);return row;}
   if(action==='storyboard-patch'){saves.push(payload);return {ok:true};}
   throw Error(action);
  },
 });
 const local={id:'voice:陆承骁:sample',kind:'audio',projectId:'p',filePath:'managed/voice.wav'};
 const stale={id:'voice:秦南溪:old',kind:'audio',projectId:'p',filePath:'unavailable/voice.wav'};
 const p={projectId:'p',editPolicy:'direct',updates:{content:'@audio1 @audio2',generationConfig:{references:[local,stale]}}};
 await cloud.patchStoryboard(p);
 await cloud.patchStoryboard(p);
 assert.equal(uploads.length,1);
 assert.equal(rows[0].note,'分镜音频 [voice:陆承骁:sample]');
 for(const saved of saves){
  assert.equal(saved.updates.content,p.updates.content);
  assert.deepEqual(saved.updates.generationConfig.references,[{id:local.id,projectId:'p',kind:'audio',
   mediaId:'audio-record',objectKey:'projects/p/audio/voice.wav',mime:'audio/wav',filename:'voice.wav'},stale]);
 }
});

test('publishing shares a voice once across shots and preserves the existing cloud editor roles',async()=>{
 const rows=[];
 let role='collaborator',writes=0;
 const cloud=createCollabService(()=>({account:{id:'member'},token:'token'}),{
  verifyStoryboardAudio:async file=>file,
  upload:async ()=>({objectKey:'projects/p/audio/take.wav',filename:'take.wav',kind:'audio',mime:'audio/wav'}),
  async callGateway(action,payload){
   if(action==='project-get')return {id:'p',myRole:role};
   if(action==='media-list')return rows;
   if(action==='media-record'){const row={...payload,id:'take'};rows.push(row);return row;}
   if(action==='storyboard-patch'){writes++;return payload;}
   throw Error(action);
  },
 });
 const config={references:[{id:'voice:base:take',kind:'audio',filePath:'managed/take.wav'}]};
 const publish={projectId:'p',operation:'publish',prompts:[{id:'a',generationConfig:config},{id:'b',generationConfig:config}]};
 await assert.rejects(cloud.patchStoryboard(publish),/编辑权限/);
 assert.equal(writes,0);
 assert.equal(rows.length,0);
 role='artist';
 const saved=await cloud.patchStoryboard(publish);
 assert.equal(rows.length,1);
 assert.equal(writes,1);
 assert.deepEqual(saved.prompts.map(shot=>shot.generationConfig.references[0].mediaId),['take','take']);
});
