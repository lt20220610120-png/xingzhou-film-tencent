import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSceneReconciliation,applySceneReconciliation} from './promptSceneReconcile.js';
import {newArtReview} from './artReview.js';
const episode={id:'ep',episodeNumber:1,content:'1-1 客厅 日 内\n小明拿起电话。'};
const project={episodes:[episode,{episodeNumber:2,content:'小明是青年男子，穿蓝衬衣。'}]};
const need={id:'n',text:'小明',category:'character',visibility:'visible',cardUid:null};
const proposal={needId:'n',category:'character',name:'【小明-蓝衬衣】',sceneEvidence:'小明拿起电话',evidenceEpisode:2,evidence:'小明是青年男子，穿蓝衬衣',description:'青年男子，蓝衬衣'};
test('缺项必须有本场存在依据及全剧外观依据，虚构证据不能进入清单',()=>{
 const scene=newArtReview(episode).scenes[0];
 assert.equal(validateSceneReconciliation(project,scene,[need],{items:[proposal]}).length,1);
 assert.throws(()=>validateSceneReconciliation(project,scene,[need],{items:[{...proposal,evidence:'凭空捏造'}]}),/依据/);
 assert.throws(()=>validateSceneReconciliation(project,scene,[need],{items:[{...proposal,sceneEvidence:'走廊有人'}]}),/本场/);
});
test('新增缺项不覆盖现有卡片，重复应用保持身份和已有信息',()=>{
 const record=newArtReview(episode),scene=record.scenes[0];scene.items=[{id:'phone',name:'【电话】',category:'prop',description:'已人工核实',ready:true}];
 const next=applySceneReconciliation(record,scene.id,[proposal],'u');
 assert.deepEqual(next.scenes[0].items[0],scene.items[0]);
 const again=applySceneReconciliation(next,scene.id,[proposal],'u');assert.equal(again.scenes[0].items.length,2);assert.deepEqual(again.scenes[0].items,next.scenes[0].items);
});
