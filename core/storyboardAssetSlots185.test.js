import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanStoryboardReferenceValue} from './storyboardReferences.js';

const projectId='project';
const slot={kind:'image',id:'adult:deleted',projectId,assetId:'adult',imageId:'deleted',url:'old.png',followAdoptedImage:false};
const upload={kind:'image',id:'upload',imageId:'upload',projectId,url:'uploaded.png'};

test('all same-project storyboard assets migrate to a card seat without changing aliases or standalone uploads',()=>{
 const raw={prompt:'@image1 @image2 @image3',references:[upload,slot,{...slot,id:'scene:retained',assetId:'scene',followAdoptedImage:true}]};
 const migrated=cleanStoryboardReferenceValue(raw,projectId);
 assert.equal(migrated.prompt,raw.prompt);
 assert.deepEqual(migrated.references.map(r=>r.id),raw.references.map(r=>r.id));
 assert.equal(migrated.references[0],upload);
 assert.deepEqual(migrated.references[1],{kind:'image',id:'adult:deleted',projectId,assetId:'adult',assetImageSlot:true});
 assert.equal(migrated.references[2].assetImageSlot,true);
 assert.equal(cleanStoryboardReferenceValue(migrated,projectId),migrated);
});
