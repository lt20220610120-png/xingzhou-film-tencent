const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createAnalysisCheckpoints}=require('./analysis-checkpoints.cjs');
test('review checkpoints survive restart and cannot overwrite legacy analysis or another account/project',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-review-checkpoint-'));try{
  let account='one';const legacy=createAnalysisCheckpoints(root,()=>account),review=createAnalysisCheckpoints(root,()=>account,'art-review-checkpoints');legacy.save({projectId:'project-a',data:{outputs:['legacy preserved']}});review.save({projectId:'project-a',data:{episodes:{1:{manual:'睡衣',pending:true}}}});
  assert.equal(createAnalysisCheckpoints(root,()=>account,'art-review-checkpoints').load({projectId:'project-a'}).episodes[1].manual,'睡衣');assert.deepEqual(legacy.load({projectId:'project-a'}),{outputs:['legacy preserved']});assert.equal(review.load({projectId:'project-b'}),null);account='two';assert.equal(review.load({projectId:'project-a'}),null);review.save({projectId:'project-a',data:{manual:'second account'}});account='one';assert.equal(review.load({projectId:'project-a'}).episodes[1].pending,true);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
