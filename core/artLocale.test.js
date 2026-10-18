import test from 'node:test';import assert from 'node:assert/strict';
import {artLocaleConstraint} from './artLocale.js';
import {buildComposedImagePrompt} from './artImageComposition.js';
import {buildEpisodeAnalysisMessages} from './collabArtSkill.js';
test('overseas art keeps local visible writing without treating Chinese narration as in-world Chinese',()=>{
 const world={genre:'背景：现代纽约，布鲁克林\n画面文字语言：英语；姓名按原文 Jack / Ethan'};
 const rule=artLocaleConstraint(world);assert.match(rule,/英语/);assert.match(rule,/中文翻译/);assert.match(rule,/试卷/);assert.match(rule,/工牌/);assert.match(rule,/原文明确/);
 for(const category of ['prop','scene','character']){const p=buildComposedImagePrompt({category,name:'【工牌】',description:'白色塑料卡，姓名杰伊'},null,'AI真人','portrait-four',world);assert.match(p,/地区文化与画面文字/);assert.match(p,/现代纽约/);}
 const messages=buildEpisodeAnalysisMessages({genre:world.genre,episodeNumber:1,content:'试卷、店铺招牌、工牌'});assert.match(messages[0].content,/可见文字/);assert.match(messages[0].content,/当地语言/);
});
test('local policy distinguishes multiple regions and script-required Chinese props, and never copies prompt instructions as policy',()=>{
 const rule=artLocaleConstraint({genre:'背景：东京；主语言：日语。中国留学生房间明确有中文家书。'});assert.match(rule,/东京/);assert.match(rule,/日语/);assert.match(rule,/明确.*例外/);
 assert.match(artLocaleConstraint({}),/待核对/);
});
