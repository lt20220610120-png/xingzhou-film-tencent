import test from 'node:test';import assert from 'node:assert/strict';
import {publishedReviewProject} from './publishedReviewProject.js';
test('asset refresh exposes only cloud-acknowledged scenes, never newer local drafts',()=>{
 const published={'1-1':{id:'1-1',items:[{name:'已发布道具',category:'prop',description:'旧描述'}]}},project={analysis_progress:{}};
 const next=publishedReviewProject(project,{episodes:{1:{version:2,published,scenes:[{id:'1-1',items:[{name:'未发布改动'}]}],roster:[{name:'未发布改动'}]},2:{version:0,published:{},roster:[{name:'未发布'}]}}});
 assert.equal(next.analysis_progress[2],undefined);assert.equal(next.analysis_progress[1].review.roster[0].name,'已发布道具');assert.equal(project.analysis_progress[1],undefined);
});
test('partial publication keeps other scene identities for legacy references',()=>{
 const project={analysis_progress:{1:{review:{version:1,scenes:[{id:'1-1',items:[]},{id:'1-2',items:[]}]}}}};
 const next=publishedReviewProject(project,{episodes:{1:{version:2,published:{'1-1':{id:'1-1',items:[]}},scenes:[{id:'1-1'},{id:'1-2',items:[{name:'未发布'}]}]}}});
 assert.deepEqual(next.analysis_progress[1].review.scenes.map(s=>s.id),['1-1','1-2']);assert.deepEqual(next.analysis_progress[1].review.scenes[1].items,[]);
});
