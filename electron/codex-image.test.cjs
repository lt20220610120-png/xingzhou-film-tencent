const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {PNG}=require('pngjs');
const {generateCodexImage}=require('./codex-image.cjs');

test('Codex image submission attaches real image bytes and accepts only a typed image completion',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'xz-codex-image-test-'));
 const png=PNG.sync.write(new PNG({width:2,height:2}));
 let closed=false;
 const createClient=()=>({
  connect:async options=>{assert.equal(options.chatgptOnly,true);return {models:[{id:'test-agent',isDefault:true}]};},
  run:async ({model,attachments,onItem,nonInteractive,developerInstructions})=>{
   assert.equal(model,'test-agent');assert.equal(nonInteractive,true);assert.match(developerInstructions,/image_gen\.imagegen/);
   assert.deepEqual(await fs.readFile(attachments[0].path),png);
   onItem({type:'agentMessage',status:'completed',result:'ignored'},{threadId:'test'});
   onItem({type:'imageGeneration',status:'completed',result:png.toString('base64')},{threadId:'test'});
  },
  close:()=>{closed=true;},
 });
 try{
  const file=await generateCodexImage({model:'gpt-image-2',prompt:'A blue cube',references:[{kind:'image',url:'data:image/png;base64,'+png.toString('base64')}],destDir:dir},{createClient});
  assert.deepEqual(await fs.readFile(file),png);assert.equal(closed,true);
  await assert.rejects(generateCodexImage({model:'gpt-image-2.5-flare',prompt:'x',destDir:dir},{createClient}),/GPT Image 2/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
