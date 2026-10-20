const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ui=fs.readFileSync(require('node:path').join(__dirname,'../src/v06/CollabWorkspace.jsx'),'utf8').replace(/\r\n/g,'\n');
const section=ui.slice(ui.indexOf('function AssetsSection('),ui.indexOf('function StoryboardSection('));
const handler=section.match(/const generateBatch = async \(\) => \{[\s\S]*?\n  \};/)[0];
async function fixture({canEdit=true,hold=false}={}){
 const {runArtImageBatch}=await import('../core/artImageBatch.js');
 const recovery=await import('../core/assetImageRecovery.js');
 const asset={id:'p',name:'道具',category:'prop',description:'完整道具描述'},project={id:crypto.randomUUID(),style:''};
 let selected=['p'],paid=0,release;const wait=hold?new Promise(resolve=>release=resolve):null;
 const scope={project,assets:[asset],canEdit,showArchived:false,batchBusy:false,batchRunning:{current:false},batchProfile:{id:'mock'},batchSize:'1024x1024',imageConcurrency:2,accountId:'a',
  imagePlan:()=>selected.includes('p')?[{asset}]:[],generatingAssetIdsRef:{current:new Set()},stopImages:{current:false},setBatchKind:()=>{},setBatchError:()=>{},setBatchBusy:()=>{},setImageProgress:()=>{},setGeneratingAssetIds:()=>{},setBatchSelectedIds:fn=>selected=fn(selected),
  runArtImageBatch,...recovery,api:{mediaGenerateImage:async()=>{paid++;if(wait)await wait;return {filePath:'C:/qa/image.png'};},collabAttachGeneratedAssetImage:async()=>({id:'saved',url:'https://example.test/saved.png'})},
  refresh:async()=>{},draftStore:{read:()=>null},readAssetReferenceChoice:()=>'',resolveAssetImageReference:()=>null,requiresAssetImageReference:()=>false,characterAppearanceIssue:()=>null,assetImageReferences:()=>[],buildImagePrompt:a=>a.description,projectCharacterComposition:()=>({}),readableCloudError:e=>e.message};
 const generate=new Function(...Object.keys(scope),handler+'\nreturn generateBatch;')(...Object.values(scope));
 return {generate,get paid(){return paid;},get selected(){return selected;},release};
}
test('saved successes leave the selection even when a cloud refresh returns stale assets',async()=>{
 const f=await fixture();await f.generate();assert.deepEqual(f.selected,[]);await f.generate();assert.equal(f.paid,1);
});
test('same-tick double click cannot submit a second paid batch',async()=>{
 const f=await fixture({hold:true});const first=f.generate();await f.generate();assert.equal(f.paid,1);f.release();await first;
});
test('read-only account cannot submit a category batch',async()=>{const f=await fixture({canEdit:false});await f.generate();assert.equal(f.paid,0);});
