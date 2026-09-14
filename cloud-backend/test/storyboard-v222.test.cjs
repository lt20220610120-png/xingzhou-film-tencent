const test=require('node:test'),assert=require('node:assert/strict');
const {patchShot,mergeDirectorEpisodes}=require('../src/storyboard-merge.cjs');
test('confirmed deletion is idempotent, does not resurrect from director, preserves videos/config elsewhere and numbering',()=>{
 const source=[{id:'ep',prompts:[{id:'s1',label:'1-1-1',content:'导演提示词'}]}];
 let rows=mergeDirectorEpisodes([],source);
 rows=patchShot(rows,{episodeId:'ep',operation:'create',scene:'1-1',shotId:'s2'});
 rows=patchShot(rows,{episodeId:'ep',operation:'delete',shotId:'s1',base:{content:'导演提示词'}});
 rows=mergeDirectorEpisodes(rows,source);assert.equal(rows[0].prompts.length,1);assert.equal(source[0].prompts.length,1);
 const request={episodeId:'ep',operation:'delete',shotId:'s2',base:{content:''}};
 rows=patchShot(rows,request);assert.deepEqual(patchShot(rows,request),rows);
 rows=patchShot(rows,{episodeId:'ep',operation:'create',scene:'1-1',shotId:'s3'});assert.equal(rows[0].prompts[0].label,'1-1-3');
});
test('delete refuses to remove a concurrently edited shot',()=>{
 const rows=[{id:'ep',prompts:[{id:'s',content:'协作者新内容',label:'1-1-1'}]}];assert.throws(()=>patchShot(rows,{episodeId:'ep',operation:'delete',shotId:'s',base:{content:'旧内容'}}),e=>e.status===409);assert.equal(rows[0].prompts.length,1);
});
