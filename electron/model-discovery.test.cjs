const test=require('node:test'),assert=require('node:assert/strict');
const {listUrl,discoverModels}=require('./model-discovery.cjs');
test('model discovery uses configured origin, preserves metadata, never sends generation requests',async()=>{
 assert.equal(listUrl('https://example.test/v1/images/generations'),'https://example.test/v1/models');
 assert.equal(listUrl('https://example.test/api/v3'),'https://example.test/api/v3/models');
 let calls=0;
 const result=await discoverModels({endpoint:'https://example.test/v1',apiKey:'key'},async(url,options)=>{calls++;assert.equal(options.method,undefined);assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer key');return Response.json({data:[{id:'v',capabilities:{durations:[5,30]}},{id:'v'}]});});
 assert.equal(calls,1);assert.equal(result.length,1);assert.deepEqual(result[0].capabilities.durations,[5,30]);
 for(const endpoint of ['https://example.test','https://example.test/v1/models','https://example.test/v1/chat/completions']) {
   const [model]=await discoverModels({endpoint},async()=>Response.json({data:[{id:'image'}]}));
   assert.equal(model.endpoint,'https://example.test/v1');
 }
});
