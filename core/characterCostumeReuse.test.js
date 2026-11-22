import test from 'node:test';
import assert from 'node:assert/strict';
import {reuseCharacterCostumes} from './characterCostumeReuse.js';
import {buildAssetRows, parseArtAnalysis, normalizeArtAssets} from './collabStore.js';
import {decodeArtReviewOutput, applyArtReviewCandidate, newArtReview} from './artReview.js';

const base={id:'original',category:'character',name:'【郑立成-日常西装】',description:'脸型：方脸；发型：黑色短发；服装：藏青西装白衬衫。',first_episode:1,episodes:[1],sceneIds:['1-1']};
const state=(suffix,episode=2)=>({id:suffix,category:'character',name:`【郑立成-日常西装·${suffix}】`,description:`参考【郑立成-日常西装】；状态差异：${suffix}，衬衫皱褶，领口敞开，无伤口，无新增破洞；其他服装延续基准。`,first_episode:episode,episodes:[episode],sceneIds:[`${episode}-1`]});
const inventory=(rows,n=2)=>`### 第${n}集\n人物：\n${rows.map(row=>`- ${row.name} ${row.description}`).join('\n')}\n场景：\n- 无（本集未识别到该类资产）\n道具：\n- 无（本集未识别到该类资产）`;

test('action states reuse the named costume and retain episodes/scenes without mutating the source',()=>{
 const input=[base,...['疲惫守夜态','疲惫背母态','药后惊醒态','踹门掀桌态','律所会谈态','暴雨湿透态','帮忙拆箱态'].map((s,i)=>state(s,i+2))];
 const snapshot=structuredClone(input),result=reuseCharacterCostumes(input).assets;
 assert.equal(result.length,1);assert.equal(result[0].id,'original');assert.equal(result[0].description,base.description);
 assert.deepEqual(result[0].episodes,[1,2,3,4,5,6,7,8]);assert.equal(result[0].sceneIds.length,8);
 assert.equal(result[0].nameAliases.length,7);assert.deepEqual(input,snapshot);
 assert.deepEqual(reuseCharacterCostumes(result).assets,result);
 // Existing persisted IDs remain available to saved storyboard references.
 assert.equal(normalizeArtAssets(input).length,input.length);
});
test('real clothing, significant injury, unfamiliar looks and more than ten costumes survive',()=>{
 const variants=['居家围裙态','深蓝西装·红花献花态','日常西装-受伤破烂','日常西装·拳伤血泪态','成年态','兽化态',...Array.from({length:12},(_,i)=>`礼服${i}`)]
  .map(variant=>({...state(''),name:`【郑立成-${variant}】`,description:'参考【郑立成-日常西装】；服装差异：本场明确的新造型。'}));
 assert.equal(reuseCharacterCostumes([base,...variants]).assets.length,variants.length+1);
 const injured={...state('踹门掀桌态'),description:'参考【郑立成-日常西装】；状态差异：右肩伤口包扎，袖口有血污。'};
 assert.equal(reuseCharacterCostumes([base,injured]).assets.length,2);
});
test('unknown reference, another actor and protected existing work are never hidden',()=>{
 const loose=state('疲惫守夜态');assert.equal(reuseCharacterCostumes([loose]).assets[0],loose);
 assert.equal(reuseCharacterCostumes([base,state('未知形态')]).assets.length,2);
 assert.equal(reuseCharacterCostumes([{...base,name:'【张三-日常西装】'},loose]).assets.length,2);
 for(const extra of [{images:[{url:'paid.png'}]},{image_url:'paid.png'},{manual:true},{reviewedCategory:true},{description:'【生图前置 · 单人多视图】\n自定义'}]){
  assert.equal(reuseCharacterCostumes([base,{...loose,...extra}]).assets.length,2);
 }
});
test('analysis parser preserves costume membership across episodes',()=>{
 const source=`${inventory([base],1)}\n${inventory([state('药后惊醒态')],2)}`;
 const rows=buildAssetRows(parseArtAnalysis(source));assert.equal(rows.length,1);assert.deepEqual(rows[0].episodes,[1,2]);
});
test('scene mapping follows the merged costume including string references and duplicate entries',()=>{
 const variant=state('疲惫守夜态'),episode={episodeNumber:2,content:'2-1 客厅 日 内\n郑立成守夜。'};
 const raw=inventory([variant])+'\n【逐场资产对应表】\n'+JSON.stringify({scenes:[{sceneId:'2-1',assets:[variant.name,{category:'character',name:variant.name}]}]});
 const decoded=decodeArtReviewOutput(raw,2,[base]);assert.equal(decoded.items.length,1);assert.equal(decoded.items[0].name,base.name);
 const applied=applyArtReviewCandidate(newArtReview(episode),episode,decoded,{rawOutput:raw});
 assert.equal(applied.scenes[0].items.length,1);assert.equal(applied.scenes[0].items[0].name,base.name);assert.equal(applied.rawOutput,raw);
});
test('tiredness alone reuses a costume, but actual clothing and visible bodily changes survive all ingestion paths',()=>{
 const tired=['累了','疲倦','疲劳','劳累','困倦'].map(label=>({...state(label),description:`参考${base.name}；${label}，仍穿原来同一套西装。`}));
 assert.deepEqual(reuseCharacterCostumes([base,...tired]).assets.map(a=>a.name),[base.name]);
 const changes=['战斗后脸颊淤青','手背轻微擦伤','前额细小伤口','左臂浅表划伤','眼眶红肿','右肩包扎','身体逐渐兽化','换上白色礼服参加晚宴'];
 for(const change of changes){
  const row={...state('疲倦'),description:`参考${base.name}；状态差异：${change}。`};
  assert.equal(reuseCharacterCostumes([base,row]).assets.length,2,change);
  assert.equal(buildAssetRows(parseArtAnalysis(inventory([base,row]))).length,2,change);
  assert.equal(normalizeArtAssets([base,row]).length,2,change);
  assert.equal(decodeArtReviewOutput(inventory([row]),2,[base]).items[0].name,row.name,change);
 }
});

test('new analysis retains a matching already produced or manually confirmed costume',()=>{
 const row=state('疲倦'),existing={...row,image_url:'existing.png'};
 assert.equal(reuseCharacterCostumes([row],{available:[base,existing]}).assets[0].name,row.name);
 assert.equal(decodeArtReviewOutput(inventory([row]),2,[base,existing]).items[0].name,row.name);
});
