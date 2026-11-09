const test=require('node:test'),assert=require('node:assert/strict');
const {mergeDirectorEpisodes,patchShot}=require('../src/storyboard-merge.cjs');
test('source edition switch isolates old shots and switching back restores their edits and generation results',()=>{
 const old=[{id:'ep',content:'1-1 走廊 夜 内',promptEditionId:'old',prompts:[{id:'old-p',label:'1-1-1',content:'人工修订',sourceContent:'旧词',generationConfig:{duration:15},manual:false}]}];
 const next=[{id:'ep',content:old[0].content,promptEditionId:'new',promptEditions:[{id:'old',name:'电影'},{id:'new',name:'动漫'}],prompts:[{id:'new-p',label:'1-1-1',content:'新词'}]}];
 const newer=mergeDirectorEpisodes(old,next);assert.equal(newer[0].prompts.length,1);assert.equal(newer[0].prompts[0].id,'new-p');assert.equal(newer[0].prompts[0].content,'新词');assert.equal(newer[0].prompts[0].generationConfig,undefined);
 const back=mergeDirectorEpisodes(newer,[{...next[0],promptEditionId:'old',prompts:[{id:'old-p',label:'1-1-1',content:'旧词'}]}]);assert.equal(back[0].prompts[0].id,'old-p');assert.equal(back[0].prompts[0].content,'人工修订');assert.equal(back[0].prompts[0].generationConfig.duration,15);
});
test('an old edition storyboard write is rejected after a collaborator switched edition',()=>{
 const episodes=[{id:'ep',content:'1-1 客厅 日 内',promptEditionId:'new',prompts:[]}];assert.throws(()=>patchShot(episodes,{episodeId:'ep',promptEditionId:'old',operation:'create',shotId:'late',scene:'1-1'}),/版本已切换/);assert.deepEqual(episodes[0].prompts,[]);
});
