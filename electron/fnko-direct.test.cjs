const test=require('node:test'),assert=require('node:assert/strict');
const {runFnkoDirect}=require('./fnko-direct.cjs');
test('direct canvas Fnko uses first-frame reference and saved job polling without a second submit',async()=>{
 let submitted=0,polled=0;
 const result=await runFnkoDirect({kind:'video',size:'1280x720',endpoint:'https://fanke2026.xyz/v1',apiKey:'fixture',firstFramePath:'frame.png'},null,{wait:async()=>{},jobs:{submit:async input=>{submitted++;assert.equal(input.ratio,'16:9');assert.deepEqual(input.references,[{kind:'image',filePath:'frame.png'}]);return {id:'persisted',status:'submitted'};},refresh:async input=>{polled++;assert.equal(input.apiKey,'fixture');assert.equal(input.id,'persisted');return {id:'persisted',status:'success',filePath:'video.mp4'};}}});
 assert.equal(result.filePath,'video.mp4');assert.equal(submitted,1);assert.equal(polled,1);
});
test('an ambiguous paid POST retains its persisted identity for image recovery',async()=>{
 const result=await runFnkoDirect({kind:'image'},null,{jobs:{submit:async()=>{throw Object.assign(Error('timeout'),{generationJobId:'uncertain-original'});}}});assert.equal(result.pendingGeneration.id,'uncertain-original');
 await assert.rejects(runFnkoDirect({kind:'image'},null,{jobs:{submit:async()=>{throw Object.assign(Error('missing Key'),{beforeSubmission:true});}}}),/missing Key/);
});
test('a confirmed terminal failure is retryable rather than a pending recovery',async()=>{
 await assert.rejects(runFnkoDirect({kind:'image'},null,{jobs:{submit:async()=>({id:'failed-original',status:'failed',error:'rejected by upstream'})}}),/rejected/);
});
