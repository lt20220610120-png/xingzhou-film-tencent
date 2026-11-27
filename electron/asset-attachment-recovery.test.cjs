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

test('changing accounts mid-upload never records the old image or uses the new session token',async()=>{
 let active={token:'test-session-one',account:{id:'old'}},released,uploaded;
 const entered=new Promise(resolve=>uploaded=resolve);
 const hold=new Promise(resolve=>released=resolve);
 const calls=[];
 const service=createCollabService(()=>active,{
  callGateway:async(action,_params,token)=>{calls.push([action,token]);return [{id:'a',images:[]}];},
  upload:async(_project,_file,_kind,token)=>{calls.push(['upload',token]);uploaded();await hold;return {objectPath:'p/old'};},
 });
 const work=service.attachGeneratedAssetImage({projectId:'p',assetId:'a',accountId:'old',filePath:'old.png'});
 await entered;active={token:'test-session-two',account:{id:'new'}};released();
 await assert.rejects(work,/账号已变化/);
 assert.deepEqual(calls,[['assets-list','test-session-one'],['upload','test-session-one']]);
});
