import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import bundle from './artAssetSkillV4.json' with {type:'json'};
import {COLLAB_ART_SKILL,buildEpisodeAnalysisMessages} from './collabArtSkill.js';
import {parseArtAnalysis,buildAssetRows} from './collabStore.js';
test('v4 includes every reference verbatim and existing episode message contract',()=>{
 assert.equal(Object.keys(bundle.files).length,10);
 for(const [name,content] of Object.entries(bundle.files)){assert.equal(fs.readFileSync(new URL('./builtin-skills/art-asset-list-v4/'+name,import.meta.url),'utf8'),content);assert.ok(COLLAB_ART_SKILL.includes(content));}
 const messages=buildEpisodeAnalysisMessages({genre:'民国',episodeNumber:15,content:'15-1 本集原文'});assert.match(messages[0].content,/十二段/);assert.match(messages.at(-1).content,/第15集/);assert.match(messages.at(-1).content,/15-1 本集原文/);
});
test('v4 layered clothing remains one asset; mentioned people stay in audit, not generation',()=>{
 const parsed=parseArtAnalysis('### 第1集\n人物：\n- 【小明-常服】（实际出镜，首次）资产身份：少年\n\n【内层】：白色衬衣\n【中层】：马甲\n【外层】：棉袍\n- 【叔父-仅提及】（仅提及/不生成形象资产）\n场景：\n- 【书房-日-内】（首次）木桌\n道具：\n- 无（本集未识别到该类资产）\n### 第2集\n人物：\n- 【小明-常服】（实际出镜，复用自第1集）\n场景：\n- 无（本集未识别到该类资产）\n道具：\n- 【信】（首次）宣纸\n## 人物总览\n- 【小明】');
 assert.equal(parsed.episodes[0].character.length,2);const rows=buildAssetRows(parsed);assert.equal(rows.length,3);assert.match(rows[0].description,/【外层】：棉袍/);assert.deepEqual(rows[0].episodes,[1,2]);assert.ok(!rows.some(row=>/叔父|内层|中层|外层/.test(row.name)));assert.equal(parsed.episodes[0].prop.length,0);
});
