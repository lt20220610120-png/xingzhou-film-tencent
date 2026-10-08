import test from 'node:test';
import assert from 'node:assert/strict';
import {splitScreenplayScenes,screenplayCharacterCount,validateScreenplayEpisode} from './screenplayScenes.js';

const script='第2集\n\n2-1 门口 日 外\n人物：甲、乙\n△甲拿起包。\n甲：是你的吗？\n\n## 2—2 客厅 夜 内\n人物：甲、乙\n△乙接过包。\n乙：谢谢。';
test('scene navigation preserves full text, recognizes heading variants and uses episode-scene IDs',()=>{
 const result=splitScreenplayScenes(script);assert.deepEqual(result.scenes.map(s=>s.id),['2-1','2-2']);
 assert.equal(result.prefix+result.scenes.map(s=>s.text).join(''),script);
 assert.match(result.scenes[1].text,/客厅/);assert.doesNotThrow(()=>validateScreenplayEpisode(script,2));
});
test('scene validation rejects summaries, wrong target episode, gaps and empty scene bodies',()=>{
 assert.throws(()=>validateScreenplayEpisode('甲归还了包，然后赴宴。',2),e=>e.code==='FRAMEWORK_EPISODE_FORMAT');
 assert.throws(()=>validateScreenplayEpisode(script,3),/集号/);
 assert.throws(()=>validateScreenplayEpisode(script.replace('2—2','2—3'),2),/连续/);
 assert.throws(()=>validateScreenplayEpisode(script+'\n2-3 门口 日 外\n人物：甲\n时间：日\n地点：门口',2),/动作|对白/);
});
test('word counts ignore whitespace and count Unicode characters once',()=>{
 assert.equal(screenplayCharacterCount('甲 乙\n🙂'),3);assert.equal(splitScreenplayScenes('旧稿还没有场次').scenes.length,0);
});
