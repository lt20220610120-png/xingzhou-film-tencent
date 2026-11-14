const test=require('node:test'),assert=require('node:assert/strict');
const {createCollabService}=require('./collab-service.cjs');
test('lost storyboard acknowledgment is reconciled without repeating the save',async()=>{
 let writes=0,reads=0;const receipt={id:'p',storyboardReceipt:{episodeId:'e',shot:{id:'s',content:'new',generationConfig:{model:'a'}}}};
 const service=createCollabService(()=>({token:'test',account:{id:'u'}}),{callGateway:async(action)=>{if(action==='storyboard-patch'){writes++;throw Error('云端未确认本次保存');}reads++;return receipt;}});
 assert.deepEqual(await service.patchStoryboard({projectId:'p',episodeId:'e',shotId:'s',ackOnly:true,updates:{content:'new',generationConfig:{model:'a'}}}),receipt);assert.equal(writes,1);assert.equal(reads,1);
});
