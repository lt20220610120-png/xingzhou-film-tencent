const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {speechUrl,generateSpeech}=require('./audio-provider.cjs');

const wav=()=>{const b=Buffer.alloc(48);b.write('RIFF');b.writeUInt32LE(40,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(4,40);return b;};
const config={endpoint:'http://127.0.0.1:7891/v1',model:'Qwen3-TTS-12Hz-1.7B-VoiceDesign',input:'行舟影视语音测试。',instructions:'沉稳自然的成年男声',language:'Chinese',requiresApiKey:false};
const temp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-audio-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};

test('speech accepts root, v1 and full endpoint and rejects credentials or non HTTP',()=>{
 for(const [input,expected] of [['http://localhost:7891','http://localhost:7891/v1/audio/speech'],['http://localhost:7891/v1/','http://localhost:7891/v1/audio/speech'],['https://api.example/prefix/v1/audio/speech','https://api.example/prefix/v1/audio/speech']])assert.equal(speechUrl(input),expected);
 for(const input of ['file:///tmp/test','http://user:pass@localhost:7891','https://example.com/v1?api_key=secret'])assert.throws(()=>speechUrl(input));
});
test('local generation sends instructions and language without a key and saves playable WAV',async t=>{
 const destDir=temp(t);let calls=0;
 const result=await generateSpeech({...config,destDir},{fetchFn:async(url,options)=>{
  calls++;assert.equal(url,'http://127.0.0.1:7891/v1/audio/speech');assert.equal(options.headers.Authorization,undefined);assert.equal(options.redirect,'error');
  assert.deepEqual(JSON.parse(options.body),{model:config.model,input:config.input,voice:'default',instructions:config.instructions,language:'Chinese',response_format:'wav',speed:1});
  return new Response(wav(),{headers:{'content-type':'audio/wav'}});
 }});
 assert.equal(calls,1);assert.deepEqual(fs.readFileSync(result.filePath),wav());assert.equal(result.mime,'audio/wav');assert.equal(path.dirname(result.filePath),destDir);
});
test('missing required key and empty text fail before generation',async t=>{
 for(const bad of [{requiresApiKey:true},{input:''},{input:'x'.repeat(1001)},{language:'invalid'},{speed:2}])await assert.rejects(generateSpeech({...config,...bad,destDir:temp(t)},{fetchFn:()=>assert.fail('must not generate')}));
});
test('public compatible endpoint forwards explicit key',async t=>{
 await generateSpeech({...config,endpoint:'https://tts.example/v1',requiresApiKey:true,apiKey:'example-test-key',destDir:temp(t)},{fetchFn:async(_,o)=>{assert.equal(o.headers.Authorization,'Bearer example-test-key');return new Response(wav());}});
});
test('HTTP failure never retries or saves a false result or discloses submitted key',async t=>{
 let calls=0;const destDir=temp(t);
 await assert.rejects(generateSpeech({...config,apiKey:'secret-example',destDir},{fetchFn:async()=>{calls++;return new Response('{"error":"secret-example"}',{status:503});}}),e=>/503/.test(e.message)&&!e.message.includes('secret-example'));
 assert.equal(calls,1);assert.deepEqual(fs.readdirSync(destDir),[]);
});
test('HTTP200 JSON, HTML, truncated RIFF and oversized body are rejected',async t=>{
 const destDir=temp(t);
 for(const body of ['{"ok":true}','<html>error</html>','RIFFxxxxWAVE'])await assert.rejects(generateSpeech({...config,destDir},{fetchFn:async()=>new Response(body)}),/音频|WAV/);
 await assert.rejects(generateSpeech({...config,destDir},{fetchFn:async()=>new Response(wav(),{headers:{'content-length':'999999999'}})}),/过大/);
 assert.deepEqual(fs.readdirSync(destDir),[]);
});
test('impossible WAV sample format is rejected instead of saved as successful audio',async t=>{
 const destDir=temp(t);
 for(const [offset,value] of [[22,0],[24,0],[32,0],[34,0]]){
  const bytes=wav();bytes.writeUInt16LE(value,offset);
  await assert.rejects(generateSpeech({...config,destDir},{fetchFn:async()=>new Response(bytes)}),/WAV/);
 }
 const bytes=wav();bytes.writeUInt32LE(12345,28);
 await assert.rejects(generateSpeech({...config,destDir},{fetchFn:async()=>new Response(bytes)}),/WAV/);
 assert.deepEqual(fs.readdirSync(destDir),[]);
});
test('timeout and identity abort cancel work without saving',async t=>{
 const destDir=temp(t),fetchFn=async(_,o)=>new Promise((_,reject)=>{o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true});});
 await assert.rejects(generateSpeech({...config,destDir},{fetchFn,timeoutMs:15}),/超时/);
 const controller=new AbortController();controller.abort(new Error('账号切换'));
 await assert.rejects(generateSpeech({...config,destDir,signal:controller.signal},{fetchFn}),/账号切换/);
 assert.deepEqual(fs.readdirSync(destDir),[]);
});
