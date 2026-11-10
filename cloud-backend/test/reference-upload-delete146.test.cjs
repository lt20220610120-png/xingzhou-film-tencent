const test=require('node:test'),assert=require('node:assert/strict');
const {handleMediaAction,publicMedia}=require('../src/media.cjs');
const user={id:'u'},payload={projectId:'p',mediaId:'m',purpose:'reference-upload'};
const row=()=>({id:'m',project_id:'p',user_id:'u',kind:'audio',note:'参考素材 1-1-1',object_path:'projects/p/audio/123-a-asset.wav'});
function fixture(overrides={}){let deletes=0,signs=0;const repo={getProject:async()=>({id:'p',owner_id:'u',genre:''}),findMembership:async()=>({role:'collaborator'}),isProjectLocked:async()=>false,findMedia:async()=>row(),deleteMedia:async()=>{deletes++;return row();},deleteReferenceUpload:async()=>{deletes++;return row();},...overrides};return {repo,signer:{signDelete:()=>{signs++;return {method:'DELETE',url:'https://bucket.invalid/object',authorization:'test'};}},counts:()=>({deletes,signs})};}
async function request(f,p=payload){return handleMediaAction('media-delete',p,user,f.repo,f.signer);}
test('media responses expose stable uploader id for deletion eligibility',()=>assert.equal(publicMedia(row()).userId,'u'));
for(const [name,overrides,status] of [
 ['locked project',{isProjectLocked:async()=>true},423],
 ['unavailable lock state',{isProjectLocked:async()=>undefined},503],
 ['recycled project',{getProject:async()=>({id:'p',owner_id:'u',genre:'[RECYCLE_UNTIL:2026-12-01]'})},410],
 ['director project',{getProject:async()=>({id:'p',owner_id:'u',genre:'[DIRECTOR_PROJECT]'})},403],
 ['viewer',{getProject:async()=>({id:'p',owner_id:'owner'}),findMembership:async()=>({role:'viewer'})},403],
 ['foreign uploader',{findMedia:async()=>({...row(),user_id:'other'})},403],
 ['adopted asset',{findMedia:async()=>({...row(),asset_id:'asset'})},403],
 ['adopted voice',{findMedia:async()=>({...row(),adoptedVoice:true})},403],
 ['wrong project',{findMedia:async()=>({...row(),project_id:'other'})},403],
 ['foreign namespace',{findMedia:async()=>({...row(),object_path:'projects/other/audio/a.wav'})},400],
 ['traversal namespace',{findMedia:async()=>({...row(),object_path:'projects/p/audio/../a.wav'})},400],
 ['generated output',{findMedia:async()=>({...row(),kind:'asset-image'})},403],
 ])test(`reference deletion rejects ${name} before record or object removal`,async()=>{const f=fixture(overrides);assert.equal((await request(f)).status,status);assert.deepEqual(f.counts(),{deletes:0,signs:0});});
test('strict deletion delegates to atomic guarded method and ignores caller object key',async()=>{const f=fixture({deleteMedia:async()=>assert.fail('legacy delete must not run')});assert.equal((await request(f,{...payload,objectKey:'projects/other/x'})).status,200);assert.deepEqual(f.counts(),{deletes:1,signs:1});});
test('strict deletion fails closed when guarded repository method unavailable',async()=>{const f=fixture({deleteReferenceUpload:undefined});assert.equal((await request(f)).status,503);assert.deepEqual(f.counts(),{deletes:0,signs:0});});
test('plain generated video output cannot be deleted through reference-upload purpose',async()=>{const f=fixture({findMedia:async()=>({...row(),kind:'video',note:'1-1-1 [shot:s]',object_path:'projects/p/video/a.mp4'})});assert.equal((await request(f)).status,403);assert.deepEqual(f.counts(),{deletes:0,signs:0});});
