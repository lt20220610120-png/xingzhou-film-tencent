import test from 'node:test';import assert from 'node:assert/strict';
import {adoptedAssetImage,bindingImageId} from './adoptedAssetImage.js';
import {example134} from './automatic134.fixtures.js';import {reviewSceneSignature} from './artReview.js';
import {createPromptDistributionService} from './promptDistributionService.js';import {loadFreshBinding} from './promptArtBinding.js';import {storyboardPromptValue} from './promptAssetUsage.js';
test('asset seats default to latest receipt, can explicitly adopt old image, and new receipt takes its seat',()=>{
 const images=[{id:'one',url:'one'},{id:'two',url:'two'}];assert.equal(adoptedAssetImage({images}).id,'two');assert.equal(adoptedAssetImage({images,image_url:'one'}).id,'one');assert.equal(adoptedAssetImage({images,adoptedImageId:'one'}).id,'one');assert.equal(bindingImageId({images,adoptedImageId:'two'},{imageId:'one',imageSelection:'asset'}),'two');assert.equal(bindingImageId({images,adoptedImageId:'two'},{imageId:'one',imageSelection:'explicit'}),'one');assert.equal(bindingImageId({images},{imageId:'removed',locked:true}),null);
});
test('published seat association follows adopted image changes with zero model requests',async()=>{
 const f=example134(),record=f.ledger.episodes[1],scene=record.scenes[0];record.version=2;scene.approval={signature:reviewSceneSignature(scene)};record.published={[scene.id]:{...scene,signature:reviewSceneSignature(scene)}};
 f.assets.push(...scene.items.map(i=>({id:'asset-'+i.id,category:i.category,name:i.name,images:[{id:'old-'+i.id,url:'https://example.invalid/old.png'},{id:'new-'+i.id,url:'https://example.invalid/new.png'}]})));
 await createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'}).autoAssociate();f.api.collabGetProject=async()=>f.project;f.api.collabListAssets=async()=>f.assets;f.api.artReviewLoadLocal=async()=>f.ledger;const shot=f.project.episodes[0].prompts[0];
 let b=await loadFreshBinding({api:f.api,projectId:f.project.id,accountId:'u'});let value=storyboardPromptValue(b,shot,{prompt:shot.content,references:[]},'u');assert.equal(value.references.length,3);assert(value.references.every(r=>r.imageId.startsWith('new-')));
 f.assets[0].adoptedImageId=f.assets[0].images[0].id;b=await loadFreshBinding({api:f.api,projectId:f.project.id,accountId:'u'});value=storyboardPromptValue(b,shot,value,'u');assert(value.references.some(r=>r.imageId==='old-one'));assert.equal(f.calls,0);
 f.assets[0].images.push({id:'newest',url:'https://example.invalid/newest.png'});f.assets[0].adoptedImageId='newest';b=await loadFreshBinding({api:f.api,projectId:f.project.id,accountId:'u'});value=storyboardPromptValue(b,shot,value,'u');assert(value.references.some(r=>r.imageId==='newest'));assert.equal(f.calls,0);
});
