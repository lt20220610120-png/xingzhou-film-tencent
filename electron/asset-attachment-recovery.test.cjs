const test=require('node:test'),assert=require('node:assert/strict');
const {createCollabService}=require('./collab-service.cjs');
test('lost cloud acknowledgement reconciles the same generated file without uploading or inserting again',async()=>{
 let uploaded=0,inserted=0;const images=[];
 const service=createCollabService(()=>({token:'local-test',account:{id:'u'}}),{
  upload:async()=>{uploaded++;return {filename:'unique-generated.png',objectPath:'p/key'};},
  callGateway:async(action)=>{if(action==='assets-list')return [{id:'a',images}];if(action==='asset-image-record'){inserted++;images.push({id:'i',filename:'unique-generated.png',url:'fresh'});throw Error('response lost');}throw Error('unexpected');}
 });
 const payload={projectId:'p',assetId:'a',filePath:'unique-generated.png'};
 await assert.rejects(service.attachGeneratedAssetImage(payload),/response lost/);
 const [a,b]=await Promise.all([service.attachGeneratedAssetImage(payload),service.attachGeneratedAssetImage(payload)]);
 assert.equal(a.id,'i');assert.equal(b.id,'i');assert.equal(uploaded,1);assert.equal(inserted,1);
});
