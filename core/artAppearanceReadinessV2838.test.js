import test from 'node:test';
import assert from 'node:assert/strict';
import {newArtReview,decodeArtReviewOutput,applyArtReviewCandidate,applyArtReviewCard,editArtReview,isSceneVerified,needsArtReviewDetails} from './artReview.js';
import * as core from './collabStore.js';
import {buildComposedImagePrompt} from './artImageComposition.js';
import {fillArtReviewDetails} from './artReviewRunner.js';

const clothing='服装：内层浅灰高领衫、白色实验室长褂，下装深灰长裤、黑色便鞋；妆造：发色棕灰后梳、金丝眼镜。';
const face='脸型骨相与五官：窄长脸、平直眉、眼距适中、直鼻与薄唇；发型发色：棕灰短发；身形与肤质：清瘦、冷白肤色；';
const asset={id:'doctor',category:'character',name:'【博士-研究制服】',description:clothing,ready:true};
test('nonempty ready baseline with only wardrobe remains pending and can be repaired without losing human confirmation',()=>{
 assert.equal(needsArtReviewDetails(asset),true);
 const episode={episodeNumber:1,content:'1-1 实验室 日 内\n博士出现。'};
 const raw=`### 第1集\n人物：\n- ${asset.name}（首次，换装）${clothing}\n场景：\n- 无\n道具：\n- 无\n【逐场资产对应表】\n${JSON.stringify({scenes:[{sceneId:'1-1',assets:[{category:'character',name:asset.name}]}]})}`;
 let record=applyArtReviewCandidate(newArtReview(episode),episode,decodeArtReviewOutput(raw,1));
 record=editArtReview(record,{type:'approve-episode'});
 assert.ok(isSceneVerified(record.scenes[0]));
 const repaired=applyArtReviewCard(record,record.roster[0],{item:{...asset,description:face+clothing}});
 assert.equal(repaired.roster[0].description,face+clothing);
 assert.ok(repaired.roster[0].alternatives.some(a=>a.description===clothing),'original incomplete design stays recoverable');
 assert.ok(repaired.roster[0].alternatives.every(a=>a.description!==face+clothing));
 assert.equal(needsArtReviewDetails(repaired.roster[0]),false);
 assert.ok(isSceneVerified(repaired.scenes[0]));
});
test('appearance validation distinguishes baseline, real wardrobe references, group and nonhuman forms',()=>{
 assert.match(core.characterAppearanceIssue(asset),/外貌|脸型|五官/);
 assert.equal(core.characterAppearanceIssue({...asset,description:face+clothing}),'');
 assert.equal(core.characterAppearanceIssue({...asset,name:'【博士-礼服】',description:`参考${asset.name}；服装：深蓝礼服。`},[asset]),'');
 assert.equal(core.characterAppearanceIssue({...asset,name:'【观众-便装】',description:'观众群像，默认6人；服装：日常便装。'}),'');
 assert.equal(core.characterAppearanceIssue({...asset,name:'【镜面自动机-银甲】',description:'机械机关，无眼鼻口五官；服装：银色金属甲壳。'}),'');
 assert.equal(core.characterAppearanceIssue({...asset,category:'prop'}),'');
 assert.equal(needsArtReviewDetails({...asset,manual:true}),false,'explicit human edits remain authoritative for guided progress');
});
test('explicit project image selection accepts another asset while automatic identity reference stays local to the character',()=>{
 const base={...asset,images:[]},other={id:'other',category:'character',name:'【另一角色-常服】',images:[{id:'image',url:'https://example.test/reference.png'}]};
 assert.equal(core.resolveAssetReference(base,[base,other]),null);
 assert.equal(core.resolveAssetReference(base,[base,other],'other')?.id,'other');
 const variant={...asset,id:'variant',name:'【博士-礼服】',description:`参考${asset.name}；服装：礼服。`};
 const pictured={...base,images:[{url:'https://example.test/base.png'}]};
 assert.equal(core.resolveAssetReference(variant,[pictured,variant,other])?.id,'doctor');
});
test('nonhumanoid three-headed dragon keeps its anatomy and does not inherit human five-grid defaults',()=>{
 const dragon={category:'character',name:'【三首龙-魔兽】',description:'非人巨型魔兽形态，通体龙鳞、三首并列、龙爪与翼膜。'};
 assert.equal(core.characterAppearanceIssue(dragon),'');
 assert.equal(core.inferAssetPromptMode(dragon),'creature');
 const prompt=buildComposedImagePrompt(dragon,null,'3D动漫','portrait-five');
 assert.doesNotMatch(prompt,/五格|无头|脸颈|4格统一排版/);
 assert.match(prompt,/三首并列/);
});
test('automatic detail repair requests a ready wardrobe-only card once and retains the existing hair design',async()=>{
 const episode={episodeNumber:1,content:'1-1 实验室 日 内\n博士出现。'};
 let record=newArtReview(episode);record.roster=[asset];record.unassigned=[asset];
 const calls=[],store={snapshot:()=>({episodes:{1:record}}),update:async(n,fn)=>{record=fn(record);}};
 const api={aiChat:async payload=>{calls.push(payload);const requested=JSON.parse(payload.messages[1].content).untrustedData.requestedItems;assert.equal(requested[0].description,clothing);return {ok:true,output:JSON.stringify({items:[{...asset,description:face+clothing,visible:true}]})};}};
 const args={store,episode,project:{episodes:[episode]},genre:'现代',profile:{id:'mock'},api,job:{}};
 assert.deepEqual(await fillArtReviewDetails(args),[]);
 assert.equal(calls.length,1);assert.equal(needsArtReviewDetails(record.roster[0]),false);
 assert.equal(record.roster[0].description,face+clothing);
 await fillArtReviewDetails(args);assert.equal(calls.length,1);
});
