const test = require('node:test');
const assert = require('node:assert/strict');
const { buildVideoContent } = require('./media-service.cjs');

test('视频生成请求保留分辨率和音频开关', () => {
  const content = buildVideoContent({ prompt: '镜头推进', ratio: '16:9', duration: 8, resolution: '4K', audioEnabled: true });
  assert.match(content[0].text, /--resolution 4K/);
  assert.match(content[0].text, /--audio on/);
  const silent = buildVideoContent({ prompt: '镜头推进', audioEnabled: false });
  assert.match(silent[0].text, /--audio off/);
});
test('the generic video provider reads and base64-encodes its first frame once',async t=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-video-frame-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'frame.png'),bytes=Buffer.from('fixture frame');
 fs.writeFileSync(file,bytes);
 const original=fs.promises.readFile;let reads=0;
 t.mock.method(fs.promises,'readFile',(...args)=>{if(args[0]===file)reads++;return original(...args);});
 t.mock.method(fs,'readFileSync',((read)=>(...args)=>{if(args[0]===file)reads++;return read(...args);})(fs.readFileSync));
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  const body=JSON.parse(options.body);assert.equal(body.content.find(item=>item.image_url).image_url.url,'data:image/png;base64,'+bytes.toString('base64'));
  return Response.json({content:{video_url:'data:video/mp4;base64,dmlkZW8='}});
 });
 await require('./media-service.cjs').generateVideo({endpoint:'https://provider.invalid',prompt:'fixture',firstFramePath:file,destDir:dir});
 assert.equal(reads,1);
});
