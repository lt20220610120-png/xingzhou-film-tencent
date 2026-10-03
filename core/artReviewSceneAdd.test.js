import test from 'node:test';
import assert from 'node:assert/strict';
import {applyArtReviewCandidate,editArtReview,isSceneVerified,newArtReview,reviewRoster} from './artReview.js';

const episode={episodeNumber:1,content:'1-1 卧室 夜 内\n林清雪穿睡衣。\n\n1-2 学校 日 内\n林清雪穿校服。'};
const sleep={id:'sleep',category:'character',name:'【林清雪-睡衣】',description:'原本的睡衣描述',ready:true,firstEpisode:1,alternatives:[{description:'另一版描述'}]};
const uniform={id:'uniform',category:'character',name:'【林清雪-校服】',description:'原本的校服描述',ready:true,firstEpisode:1};
const book={id:'book',category:'prop',name:'【课本】',description:'蓝色封面',ready:true};
const lamp={id:'lamp',category:'prop',name:'【台灯】',description:'',ready:false,note:'待补齐的床头灯'};
// A pending unassigned lamp cannot be episode-approved; approve each complete scene.
function reviewedFixture(){
 const record=newArtReview(episode);record.status='generated';record.roster=structuredClone([sleep,uniform,book,lamp]);record.unassigned=[structuredClone(lamp)];
 record.scenes[0].items=structuredClone([sleep]);record.scenes[1].items=structuredClone([uniform,book]);record.scenes.forEach(s=>s.mappingReady=true);
 return editArtReview(editArtReview(record,{type:'approve',sceneId:'1-1'}),{type:'approve',sceneId:'1-2'});
}

test('adding existing episode cards to a scene preserves identities, details and other verified scenes',()=>{
 const record=reviewedFixture(),before=structuredClone(record);
 const next=editArtReview(record,{type:'add-existing',sceneId:'1-1',category:'character',itemIds:['uniform']},'reviewer');
 assert.deepEqual(next.scenes[0].items.map(i=>i.id),['sleep','uniform']);
 assert.deepEqual(next.scenes[1].items.map(i=>i.id),['uniform','book']);
 assert.deepEqual(next.scenes[1],before.scenes[1]);
 assert.equal(reviewRoster(next).length,4);assert.equal(next.scenes[0].items[1].description,'原本的校服描述');
 assert.equal(next.scenes[0].items[1].ready,true);assert.deepEqual(next.scenes[0].items[0].alternatives,[{description:'另一版描述'}]);
 assert.equal(isSceneVerified(next.scenes[0]),false);assert.equal(isSceneVerified(next.scenes[1]),true);
 assert.deepEqual(record,before);
});

test('adding several existing props includes unassigned cards without filling or duplicating their information',()=>{
 const next=editArtReview(reviewedFixture(),{type:'add-existing',sceneId:'1-1',category:'prop',itemIds:['lamp','book','lamp']});
 assert.deepEqual(next.scenes[0].items.map(i=>i.id),['sleep','lamp','book']);
 assert.equal(next.scenes[0].items[1].ready,false);assert.equal(next.scenes[0].items[1].description,'');
 assert.equal(next.scenes[0].items[1].note,'待补齐的床头灯');assert.equal(next.unassigned.length,0);
 const again=editArtReview(next,{type:'add-existing',sceneId:'1-1',category:'prop',itemIds:['lamp','book']});
 assert.deepEqual(again.scenes[0].items.map(i=>i.id),['sleep','lamp','book']);assert.equal(reviewRoster(again).length,4);
});

test('adding a previously removed card restores only that scene and survives a later model candidate',()=>{
 const removed=editArtReview(reviewedFixture(),{type:'remove',sceneId:'1-2',itemId:'uniform'});
 const added=editArtReview(removed,{type:'add-existing',sceneId:'1-2',category:'character',itemIds:['uniform']});
 assert.equal(added.scenes[1].removed.length,0);assert.deepEqual(added.scenes[0].items.map(i=>i.id),['sleep']);
 const reread=applyArtReviewCandidate(added,episode,{items:[],mapping:[{sceneId:'1-1',assets:[]},{sceneId:'1-2',assets:[]}],warnings:[],complete:true});
 assert.deepEqual(reread.scenes[1].items.map(i=>i.id),['book','uniform']);assert.equal(reread.scenes[1].items[1].description,'原本的校服描述');
});

test('scene addition rejects wrong categories, removed names and foreign scene identifiers before making changes',()=>{
 const record=reviewedFixture(),before=structuredClone(record);
 for(const action of [
  {sceneId:'2-1',category:'character',itemIds:['uniform']},
  {sceneId:'1-1',category:'prop',itemIds:['book','uniform']},
  {sceneId:'1-1',category:'prop',itemIds:['missing']},
  {sceneId:'1-1',category:'prop',itemIds:[]},
  {sceneId:'1-1',category:'wrong',itemIds:['book']},
 ])assert.throws(()=>editArtReview(record,{type:'add-existing',...action}));
 const deleted=editArtReview(record,{type:'roster-remove',itemId:'uniform'});
 assert.throws(()=>editArtReview(deleted,{type:'add-existing',sceneId:'1-1',category:'character',itemIds:['uniform']}));
 assert.deepEqual(record,before);
});
