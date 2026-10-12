const test=require('node:test'),assert=require('node:assert/strict');
const {listUrl,discoverModels}=require('./model-discovery.cjs');
test('特殊模型列表路径不能替代生成接口的base地址',async()=>{
 const [row]=await discoverModels({endpoint:'https://provider.test/v1',modelListPath:'/catalog/list'},async url=>{assert.equal(url,'https://provider.test/catalog/list');return Response.json({data:[{id:'video-new',type:'video'}]});});assert.equal(row.endpoint,'https://provider.test/v1');
});
test('混合目录尊重输出模态，不把未知文本、图片和嵌入模型当作视频',async()=>{
 const models=await discoverModels({endpoint:'https://maxforai.top/v1',apiKey:'fixture',purpose:'video'},async()=>Response.json({data:[{id:'future-video-text',output_modalities:['text']},{id:'qwen-next'},{id:'embedding-v4'},{id:'seedream-5'},{id:'untyped-unknown'},{id:'new-render-engine',architecture:{output_modalities:['video']}}]}));
 for(const id of ['future-video-text','qwen-next','embedding-v4','seedream-5','untyped-unknown'])assert.notEqual(models.find(m=>m.id===id).kind,'video',id);
 assert.equal(models.find(m=>m.id==='new-render-engine').kind,'video');
});
test('飞拓完整生成路径拉取公共编号和顶层视频能力，不提交任务',async()=>{
 const [model]=await discoverModels({endpoint:'https://feituokuajing.com/api/open/v1/video/generate',apiKey:'fixture'},async(url,options)=>{
  assert.equal(url,'https://feituokuajing.com/api/open/v1/models');assert.equal(options.headers['X-Public-Model-Ids'],'1');assert.equal(options.method,undefined);
  return Response.json({data:[{id:'ft-video-v1-fixture',type:'video',capabilities:['video_generation'],durations:[15,30],resolutions:['720p'],aspect_ratios:['16:9']}]});
 });assert.equal(model.kind,'video');assert.deepEqual(model.capabilities.durations,[15,30]);
});
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
test('MaxForAI 与 9Y 从官方 models 列表识别当前和未来视频型号并合并参数',async()=>{
 assert.equal(listUrl('https://maxforai.top/v1/video/generations'),'https://maxforai.top/v1/models');
 assert.equal(listUrl('https://9yapi.shop/v1/videos'),'https://9yapi.shop/v1/models');
 assert.equal(listUrl('https://9yapi.shop/docs/#videos'),'https://9yapi.shop/v1/models');
 const max=await discoverModels({endpoint:'https://maxforai.top/v1',apiKey:'key',purpose:'video'},async()=>Response.json({data:[{id:'FT-未来视频型号'},{id:'gpt-5.2'}]}));assert.equal(max.find(m=>m.id==='FT-未来视频型号').kind,'video');assert.equal(max.find(m=>m.id==='gpt-5.2').kind,'chat');
 const niney=await discoverModels({endpoint:'https://9yapi.shop/v1',apiKey:'key',purpose:'video'},async()=>Response.json({data:[{id:'官转wan3.0-标准版'},{id:'供应商新视频'}]}));assert.deepEqual(niney[0].capabilities.resolutions,['480p','720p','1080p']);assert.equal(niney[1].kind,'video');
});
