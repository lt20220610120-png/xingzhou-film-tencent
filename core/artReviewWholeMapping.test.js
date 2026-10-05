import test from 'node:test';
import assert from 'node:assert/strict';
import {isSceneVerified} from './artReview.js';
import {runArtReviewAnalysis} from './artReviewRunner.js';
test('whole information reading finishes every episode mapping without visiting its review page',async()=>{
 const episodes=[1,2,3].map(n=>({episodeNumber:n,title:`第${n}集`,content:`${n}-1 卧室 日 内\n甲看书。`}));
 const project={id:crypto.randomUUID(),genre:'现代',episodes,analysis_progress:{}},calls=[];let disk=null;
 const api={artReviewLoadLocal:async()=>disk,artReviewSaveLocal:async p=>{disk=structuredClone(p.data);},analysisLoad:async()=>null,aiChat:async p=>{
  calls.push(p);const scene=JSON.parse(p.messages[1].content).sceneIds;
  if(scene)return {ok:true,output:JSON.stringify({scenes:scene.map(id=>({sceneId:id,assets:[{category:'prop',name:'【课本】'}]}))})};
  const number=Number(p.messages[0].content.match(/第\s*(\d+)\s*集/)?.[1]||calls.filter(c=>!JSON.parse(c.messages[1].content).sceneIds).length);
  return {ok:true,output:`### 第${number}集\n`+'人物：\n- 无\n场景：\n- 无\n道具：\n- 【课本】蓝色书本封面，纸质书页。'};
 }};
 const result=await runArtReviewAnalysis({project,genre:project.genre,profile:{id:'p',model:'m'},api});
 assert.deepEqual(result.errors,[]);assert.ok(episodes.every(e=>disk.episodes[e.episodeNumber].scenes.every(s=>s.mappingReady)));
 assert.ok(episodes.every(e=>disk.episodes[e.episodeNumber].scenes.every(s=>!isSceneVerified(s))));
 const count=calls.length;await runArtReviewAnalysis({project,genre:project.genre,profile:{model:'m'},api});assert.equal(calls.length,count);
});
