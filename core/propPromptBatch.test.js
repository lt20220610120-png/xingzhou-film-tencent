import test from 'node:test';import assert from 'node:assert/strict';
import {assetPromptUsage,assetMatchesPromptCount} from './promptAssetUsage.js';
import {planAssetCategoryBatch,runArtImageBatch} from './artImageBatch.js';
import {ungeneratedAssets} from './assetImages.js';
import {entryBindingSignature} from './promptArtBinding.js';
const prop=id=>({id,category:'prop',name:id,sceneIds:['1-1'],episodes:[1],images:[]});
test('prompt thresholds are inclusive and validate positive whole numbers without a fixed upper limit',()=>{
 for(const n of [1,2,3,6,99]){assert.equal(assetMatchesPromptCount(n,'at-least',n),true);assert.equal(assetMatchesPromptCount(n-1,'at-least',n),false);assert.equal(assetMatchesPromptCount(n,'at-most',n),true);assert.equal(assetMatchesPromptCount(n+1,'at-most',n),false);}
 for(const n of [0,-1,1.5,NaN])assert.equal(assetMatchesPromptCount(5,'at-least',n),false);
 assert.equal(assetMatchesPromptCount(0,'at-most',2),true);assert.equal(assetMatchesPromptCount(0,'all',2),true);
});
test('count distinct linked prompts, not episodes, duplicate rows or multiple references within a prompt',()=>{
 const a=prop('cup'),binding={publishedStoryboards:[{label:'1-1-1',generationConfig:{bindingAssetIds:['cup'],references:[{assetId:'cup'},{assetId:'cup'}]}},{label:'1-1-1',generationConfig:{bindingAssets:[{assetId:'cup'}]}},{label:'1-1-2',generationConfig:{bindingAssets:[{category:'prop',name:'cup'}]}},{label:'2-1-1',generationConfig:{references:[{assetId:'cup'}]}},{label:'2-1-2',generationConfig:{bindingAssets:[{assetId:'other',category:'prop',name:'cup'}]}}]};
 assert.deepEqual(assetPromptUsage(binding,a).promptIds,['1-1-1','1-1-2','2-1-1']);
});
test('unpublished associations count only saved current choices and retain human exclusions',()=>{
 const a=prop('cup'),card={uid:'card',assetId:a.id,category:a.category,name:a.name,sceneIds:['1-1'],description:'white cup',images:[]},entry={id:'p',label:'1-1-1',sceneId:'1-1',prompt:'【基础设定】\n道具：cup'},snapshot={cards:[card],entries:[entry]},d={signature:entryBindingSignature(snapshot,entry),needs:[{cardUid:'card',visibility:'visible'}]};
 const binding={snapshot,decisions:{p:d}};assert.equal(assetPromptUsage(binding,a).promptIds.length,1);d.needs[0].visibility='excluded';assert.equal(assetPromptUsage(binding,a).promptIds.length,0);delete binding.decisions.p;assert.equal(assetPromptUsage(binding,a).promptIds.length,0);
});
test('at least two generates only matching selected ungenerated props, including a five-prompt prop',async()=>{
 const assets=[prop('zero'),prop('one'),prop('two'),prop('five'),{...prop('done'),images:[{id:'img'}]}],binding={publishedStoryboards:Array.from({length:5},(_,i)=>({label:'1-1-'+(i+1),generationConfig:{bindingAssetIds:[...(i<1?['one']:[]),...(i<2?['two','done']:[]),'five']}}))};
 const eligible=assets.filter(a=>assetMatchesPromptCount(assetPromptUsage(binding,a).promptIds.length,'at-least',2)),selected=ungeneratedAssets(eligible).map(a=>a.id),calls=[];
 await runArtImageBatch(planAssetCategoryBatch(assets,{category:'prop',selectedIds:selected}),{generate:async a=>{calls.push(a.id);return {id:'image'}}});assert.deepEqual(calls,['two','five']);
 assert.deepEqual(assets.filter(a=>assetMatchesPromptCount(assetPromptUsage(binding,a).promptIds.length,'at-least',6)),[]);
});
