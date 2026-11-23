import test from 'node:test';
import assert from 'node:assert/strict';
import {projectStoryboardImageAliases,editStoryboardImageAliases,storyboardReferencePreviews,visibleStoryboardReference} from './storyboardReferences.js';
import {numberedReferences} from './generationReferences.js';
import {matchBasicReferences,projectReferenceCandidates} from './automaticReferences.js';

const seats=Array.from({length:7},(_,index)=>({id:'asset-'+(index+1),kind:'image',assetImageSlot:true}));
const ready=seats.filter((_,index)=>index!==5);
const canonical='人物（参考@image1 @image2 @image3 @image4 @image5），冷链重卡（参考@image6），场景（参考@image7）。\n手调：同一车位 @image6，再看场景 @image7，音色@audio1。';
const compact='人物（参考@image1 @image2 @image3 @image4 @image5），冷链重卡，场景（参考@image6）。\n手调：同一车位 ，再看场景 @image6，音色@audio1。';

test('old seven-seat references render only six assigned aliases and a later adoption restores both anchors',()=>{
 const projection=projectStoryboardImageAliases(canonical,seats,ready);
 assert.equal(projection.prompt,compact);
 assert.deepEqual(numberedReferences(ready).map(ref=>ref.alias),['@image1','@image2','@image3','@image4','@image5','@image6']);
 assert.equal(projectStoryboardImageAliases(canonical,seats,seats).prompt,canonical);
});

test('editing visible aliases with a latent seat retains the chosen reference identity and unrelated prose',()=>{
 const projection=projectStoryboardImageAliases(canonical,seats,ready);
 const edited=compact.replace('手调：','镜头手调：')+'\n末尾新增 @image6。';
 const saved=editStoryboardImageAliases(canonical,projection,edited);
 assert.equal(saved,canonical.replace('手调：','镜头手调：')+'\n末尾新增 @image7。');
 assert.equal(projectStoryboardImageAliases(saved,seats,ready).prompt,edited);
 assert.equal(projectStoryboardImageAliases(saved,seats,seats).prompt,saved);
});

test('an empty seat inside one mixed reference group remains anchored across edits',()=>{
 const original='货车和场景（参考@image5 @image6 @image7）。后续照旧';
 const projection=projectStoryboardImageAliases(original,seats,ready);
 assert.equal(projection.prompt,'货车和场景（参考@image5 @image6）。后续照旧');
 const draft=editStoryboardImageAliases(original,projection,projection.prompt.replace('照旧','改镜头'));
 assert.equal(draft,original.replace('照旧','改镜头'));
 assert.equal(editStoryboardImageAliases(original,projection,projection.prompt),original);
});

test('separate image mentions are rewritten without altering email addresses or literal suffixes',()=>{
 const original='联系 demo@image7.example；变量 @image7_name；真实 @image7。';
 const projection=projectStoryboardImageAliases(original,seats,ready);
 assert.equal(projection.prompt,'联系 demo@image7.example；变量 @image7_name；真实 @image6。');
});

test('adjacent image mentions remain separate references through projection, editing and later adoption',()=>{
 const original='冷链 @audio1@image6@image7，双图（参考@image5@image7）。联系 demo@image6@image7';
 const projection=projectStoryboardImageAliases(original,seats,ready);
 assert.equal(projection.prompt,'冷链 @audio1@image6，双图（参考@image5 @image6）。联系 demo@image6@image7');
 const edited=projection.prompt.replace('双图','第二镜')+'\n@image5@image6';
 const canonicalDraft=editStoryboardImageAliases(original,projection,edited);
 assert.equal(canonicalDraft,'冷链 @audio1@image6@image7，第二镜（参考@image5 @image7）。联系 demo@image6@image7\n@image5@image7');
 assert.equal(projectStoryboardImageAliases(canonicalDraft,seats,ready).prompt,edited);
});

test('new scene drafts keep explicitly linked empty seats and add no unrelated empty assets',()=>{
 const projectId='isolation',scene='1-1';
 const names=['皮箱','水杯','手机','钥匙','戒指','冷链重卡','纸袋'];
 const assets=names.map((name,index)=>({
  id:seats[index].id,name,projectId,category:'prop',sceneIds:[scene],
  image_url:index===5?'':'https://fixture.test/'+index+'.png',adoptedImageId:index===5?null:'image-'+index,
 }));
 assets.push({id:'outside',category:'prop',name:'外场资产',sceneIds:['1-2']});
 const references=projectReferenceCandidates(assets,[],projectId,1,scene,{assetImageSlots:true,includeEmptyAssetSlots:true});
 const draft=matchBasicReferences({references,prompt:'【基础设定】\n道具：'+names.join('；')});
 const previews=storyboardReferencePreviews(draft.references,assets,[],projectId);
 assert.equal(draft.references.length,7);
 assert.match(draft.prompt,/冷链重卡（参考@image6）；纸袋（参考@image7）/);
 assert.match(projectStoryboardImageAliases(draft.prompt,references,previews.filter(visibleStoryboardReference)).prompt,/冷链重卡；纸袋（参考@image6）/);
});
