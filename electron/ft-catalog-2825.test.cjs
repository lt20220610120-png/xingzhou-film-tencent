const test=require('node:test'),assert=require('node:assert/strict');
const client=require('./feituo-client.cjs'),models=require('../core/feituo-models.json');
const sample=more=>({kind:'video',model:'ft-video-v1-451adae35b0c4a3d275c2c46394abc98',prompt:'镜头推进',ratio:'16:9',duration:30,resolution:'720p',references:[],apiKey:'fixture',...more});
test('新官方2.5与XN2模型可以提交，时长和素材限制以目录为准',()=>{
 assert.equal(client.validate(sample()).maxImages,30);
 assert.equal(client.validate(sample({model:'ft-video-v1-9f4e77de6c05f3c360c1c0b9938a44a4',duration:29,resolution:'480p'})).maxPrompt,9999);
 assert.throws(()=>client.validate(sample({model:'ft-video-v1-9f4e77de6c05f3c360c1c0b9938a44a4',duration:30})),/时长/);
});
test('最新目录允许音频单独参考的型号，不统一要求图片；新2k型号要求图片',()=>{
 assert.doesNotThrow(()=>client.validate(sample({model:'ft-video-v1-77e8ee7a636f15dac27b2ce6d6fcd746',duration:5,resolution:'768p',references:[{kind:'audio',url:'https://example.test/audio.mp3'}]})));
 assert.throws(()=>client.validate(sample({model:'ft-video-v1-4edb37caf7f3ad2875378757cc1f1db5',duration:10,resolution:'2k'})),/至少.*图片/);
});
test('保留已保存旧型号，新增官方型号使用标准generate协议',async t=>{
 assert.ok(models.find(m=>m.id==='ft-video-v1-3dd9e73a8bd0d4e06ba6ebcbddafd811'));
 let payload;t.mock.method(global,'fetch',async(_,o)=>{payload=JSON.parse(o.body);return Response.json({success:true,jobId:'mock-job'});});
 await client.submit(sample({references:[{kind:'audio',url:'https://example.test/a.mp3'}]}));
 assert.equal(payload.duration,30);assert.deepEqual(payload.audioUrls,['https://example.test/a.mp3']);assert.equal(payload.metadata,undefined);
});
