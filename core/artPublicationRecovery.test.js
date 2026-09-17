import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildSavedArtPublication} from './artPublicationRecovery.js';
const require=createRequire(import.meta.url);
const {parsePublicationOutput,validatePublicationAssets,publicationFirstEpisode}=require('../cloud-backend/src/analysis-publication.cjs');
const wrap=(n,chars='- 无',props='- 无')=>`### 第${n}集\n人物：\n${chars}\n场景：\n- 无\n道具：\n${props}`;
const record=output=>({fingerprint:'paid',chunks:['38-1 家 日 内'],outputs:[output],published:false});
const run=(ledger,existingAssets=[])=>buildSavedArtPublication({ledger,episode:{episodeNumber:38,title:'第38集',content:'38-1 家 日 内'},genre:'都市',existingAssets,project:{episodes:[]}});
const validate=result=>{const parsed=parsePublicationOutput(result.output,38);return validatePublicationAssets(result.assets,parsed,38);};
test('saved self-reuse recovers exact same-fingerprint archived description without changing paid source',()=>{
 const ledger={episodes:{38:record(wrap(38,'- 【经理-西装】（复用自第38集）'))},history:{38:[record(wrap(38,'- 【经理-西装】（首次）脸型：方脸；服装：黑色西装。'))]}};
 const before=structuredClone(ledger),result=run(ledger);
 assert.equal(result.assets.length,1);assert.match(result.assets[0].description,/黑色西装/);
 assert.doesNotMatch(result.output,/复用自第38集/);validate(result);assert.deepEqual(ledger,before);
});
test('wrong past reuse number is corrected only from exact existing asset membership',()=>{
 const old={id:'kept',name:'【手机】',category:'prop',first_episode:6,episodes:[6,37],description:'手工描述',image_url:'old.png'};
 const result=run({episodes:{38:record(wrap(38,'- 无','- 【手机】（复用自第36集）'))}},[old]);
 assert.match(result.output,/复用自第6集/);const [checked]=validate(result);assert.equal(publicationFirstEpisode(checked,[old],38),6);
 assert.equal(old.description,'手工描述');
});
test('unprovable name is quarantined visibly instead of fuzzily merging or blocking valid peers',()=>{
 const old={name:'【周某随行女子-休闲装】',category:'character',first_episode:37,episodes:[37],description:'脸型：圆脸；服装：连衣裙。'};
 const result=run({episodes:{38:record(wrap(38,'- 【随行女子-休闲装】（复用自第37集）','- 【纸袋】（首次）牛皮纸袋。'))}},[old]);
 assert.deepEqual(result.assets.map(a=>a.name),['【纸袋】']);assert.ok(result.warnings.some(s=>s.includes('随行女子')&&s.includes('待核对')));validate(result);
});
test('in-output repeated same-episode restart uses the final complete block and keeps original unchanged',()=>{
 const output=wrap(38,'- 无','- 【废弃半截】（首次）')+wrap(38,'- 无','- 【最终地图】（首次）纸质地图。');
 const ledger={episodes:{38:record(output)}};const result=run(ledger);
 assert.deepEqual(result.assets.map(a=>a.name),['【最终地图】']);validate(result);assert.equal(ledger.episodes[38].outputs[0],output);
});
test('different-episode content and incomplete restart are not silently stripped into valid publication',()=>{
 for(const output of [wrap(38)+'\n'+wrap(39),wrap(38)+'\n### 第38集\n人物：\n- 【甲】（首次）脸型：圆脸。']){
  assert.throws(()=>run({episodes:{38:record(output)}}),/串集|完整/);
 }
});
test('full chunk outputs merge within the target episode instead of discarding earlier chunks',()=>{
 const r={...record(''),chunks:['38-1 家 日 内','38-2 家 夜 内'],outputs:[wrap(38,'- 无','- 【前段纸袋】（首次）纸袋。'),wrap(38,'- 无','- 【后段文件】（首次）文件。')]};
 const result=buildSavedArtPublication({ledger:{episodes:{38:r}},episode:{episodeNumber:38,content:r.chunks.join('')},existingAssets:[]});
 assert.deepEqual(result.assets.map(a=>a.name),['【前段纸袋】','【后段文件】']);validate(result);
});
