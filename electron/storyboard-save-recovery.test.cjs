const test=require('node:test'),assert=require('node:assert/strict');
const {createCollabService}=require('./collab-service.cjs');
test('lost storyboard acknowledgment is reconciled without repeating the save',async()=>{
 let writes=0,reads=0;const receipt={id:'p',storyboardReceipt:{episodeId:'e',shot:{id:'s',content:'new',generationConfig:{model:'a'}}}};
 const service=createCollabService(()=>({token:'test',account:{id:'u'}}),{callGateway:async(action)=>{if(action==='storyboard-patch'){writes++;throw Error('云端未确认本次保存');}reads++;return receipt;}});
 assert.deepEqual(await service.patchStoryboard({projectId:'p',episodeId:'e',shotId:'s',ackOnly:true,updates:{content:'new',generationConfig:{model:'a'}}}),receipt);assert.equal(writes,1);assert.equal(reads,1);
});
test('different content, publication or unavailable readback never acknowledge an ambiguous save',async()=>{
 for(const mismatch of ['content','publication','offline']){
  let writes=0,reads=0;
  const service=createCollabService(()=>({token:'test',account:{id:'u'}}),{callGateway:async action=>{
   if(action==='storyboard-patch'){writes++;throw Error('云端未确认本次保存');}
   reads++;if(mismatch==='offline')throw Error('network');
   return {id:'p',storyboardReceipt:{episodeId:'e',shot:{id:'s',content:mismatch==='content'?'other':'new',storyboardPublicationId:mismatch==='publication'?'v2':'v1'}}};
  }});
  await assert.rejects(service.patchStoryboard({projectId:'p',episodeId:'e',shotId:'s',storyboardPublicationId:'v1',ackOnly:true,updates:{content:'new'}}),/未确认/);
  assert.equal(writes,1);assert.equal(reads,1);
 }
});
test('account changes and denied writes cannot trigger readback or acknowledge old saves',async()=>{
 for(const mode of ['switch-write','switch-read','denied','create']){
  let token='first',reads=0;
  const service=createCollabService(()=>({token,account:{id:token}}),{callGateway:async action=>{
   if(action==='storyboard-patch'){if(mode==='switch-write')token='second';throw Error(mode==='denied'?'你没有权限':'云端未确认本次保存');}
   reads++;token='second';return {id:'p',storyboardReceipt:{shot:{id:'s',content:'new'}}};
  }});
  await assert.rejects(service.patchStoryboard({projectId:'p',episodeId:'e',shotId:'s',ackOnly:true,operation:mode==='create'?'create':undefined,updates:{content:'new'}}));
  assert.equal(reads,mode==='switch-read'?1:0);
 }
});
