import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanStoryboardReferenceValue,storyboardReferencePreviews,visibleStoryboardReference} from './storyboardReferences.js';

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

test('only an adopted asset image becomes a visible storyboard reference',()=>{
 const refs=[slot,upload];
 const historical={id:'old',url:'old.png'};
 const asset={id:'adult',projectId,adoptedImageId:null,image_url:'',images:[historical]};
 assert.deepEqual(storyboardReferencePreviews(refs,[asset],[],projectId).filter(visibleStoryboardReference).map(r=>r.id),[upload.id]);
 const adopted={...asset,adoptedImageId:'old',image_url:historical.url};
 const active=storyboardReferencePreviews(refs,[adopted],[],projectId).filter(visibleStoryboardReference);
 assert.deepEqual(active.map(r=>r.id),refs.map(r=>r.id));
 assert.equal(active[0].assetId,slot.assetId);
});
