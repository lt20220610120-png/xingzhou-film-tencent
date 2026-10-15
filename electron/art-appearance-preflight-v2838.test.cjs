const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ui=fs.readFileSync(path.join(__dirname,'../src/v06/CollabWorkspace.jsx'),'utf8').replace(/\r\n/g,'\n');
const single=ui.slice(ui.indexOf('function AssetImageBox('),ui.indexOf('function ManualAssetDialog('));
const batch=ui.slice(ui.indexOf('function ArtSection('),ui.indexOf('function AssetsSection('));
const prelude=ui.slice(ui.indexOf('const assetReferenceKey ='),ui.indexOf('function AssetImageBox('));
const declaration=(s,n)=>s.match(new RegExp(`\\bconst ${n}\\s*=[^;]+;`))[0];
const entry=(s,n)=>s.match(new RegExp(`const ${n} = async \\([^)]*\\) => \\{[\\s\\S]*?\\n  \\};`))[0];
async function run(kind,{recovering=false,reference=false,local=false}={}){
 const core=await import('../core/collabStore.js'),recovery=await import('../core/assetImageRecovery.js'),refs=await import('../core/generationReferences.js'),batchCore=await import('../core/artImageBatch.js');
 const asset={id:'doctor',name:'【博士-研究制服】',category:'character',first_episode:1,episodes:[1],images:[],description:'服装：白色实验室长褂、深灰长裤；妆造：棕灰后梳短发、眼镜。'};
 const other={id:'other',name:'【其他造型】',category:'character',images:[{id:'ref-image',url:'https://example.test/ref.png'}]};
 const assets=[asset,other],calls=[],errors=[];
 const api={mediaGenerateImage:async p=>{calls.push(p);return {};},generationRefresh:async()=>{calls.push('recover');return {status:'success',filePath:'old.png'};},collabAttachGeneratedAssetImage:async()=>({id:'saved',url:'https://example.test/saved.png'})};
 const scope={...core,...recovery,...refs,...batchCore,api,project:{id:crypto.randomUUID(),style:''},asset,assets,pendingImage:recovering?{taskId:'old-task'}:null,
  accountId:'a',refId:local?'__local__':reference?'other':null,localStorage:{getItem:k=>k.startsWith('xz-asset-local-reference:')?(local?JSON.stringify({id:'local',kind:'image',filePath:'C:/managed-media/reference.png',name:'参考.png'}):null):local?'__local__':reference?'other':null},generating:false,busy:false,canEdit:true,size:'1024x1024',profile:{id:'mock'},batchProfile:{id:'mock'},batchSize:'1024x1024',
  projectCharacterComposition:()=>({}),generatingAssetIdsRef:{current:new Set()},batchSelectedIds:['doctor'],batchBusy:false,imageConcurrency:1,stopImages:{current:false},episode:1,
  setError:e=>errors.push(e),setExportError:e=>errors.push(e),setBusy:()=>{},setGeneratingAssetIds:()=>{},setBatchBusy:()=>{},setWholeDialog:()=>{},setImageProgress:()=>{},setLocalImages:()=>{},setSelectedImageId:()=>{},
  readableCloudError:e=>e.message,beforeGenerate:null,onGenerateImage:null,refresh:async()=>{},draftStore:{read:()=>null}};
 if(recovering)scope.readAssetImageRecovery=()=>({taskId:'old-task'});
 const body=kind==='single'?[prelude,declaration(single,'refAsset'),declaration(single,'referenceRequired'),declaration(single,'explicitlyNoReference'),entry(single,'generate'),'return generate;']:[prelude,declaration(batch,'imagePlan'),entry(batch,'generateBatch'),'return generateBatch;'];
 // Replace only the media request for recovered tasks: real recovery is separately covered.
 if(recovering)scope.requestAssetImage=async()=>{calls.push('recover');return {filePath:'old.png'};};
 const execute=new Function(...Object.keys(scope),body.join('\n'))(...Object.values(scope));
 await execute();return {calls,errors};
}
for(const kind of ['single','batch']){
 test(`${kind} wardrobe-only first card cannot create a paid image`,async()=>{const r=await run(kind);assert.equal(r.calls.length,0);assert.match(r.errors.join('\n'),/外貌|脸型|五官/);});
 test(`${kind} manually chosen project reference supplies the missing visual anchor`,async()=>{const r=await run(kind,{reference:true});assert.equal(r.calls.length,1);assert.equal(r.calls[0].references[0].assetId,'other');});
 test(`${kind} local image reference reaches the existing media API as a file`,async()=>{const r=await run(kind,{local:true});assert.equal(r.calls.length,1);assert.equal(r.calls[0].references[0].filePath,'C:/managed-media/reference.png');assert.equal(r.calls[0].references[0].kind,'image');});
 test(`${kind} recovery bypasses appearance preflight and never resubmits a paid job`,async()=>{const r=await run(kind,{recovering:true});assert.deepEqual(r.calls,['recover']);});
}
test('reference picker exists for a first card without any project images',()=>{
 assert.doesNotMatch(single,/\{\(mates\.length\s*>\s*0\|\|referenceRequired\)\s*&&\s*<label className="collab-ref-picker"/);
 assert.match(single,/<label className="collab-ref-picker"/);
});
test('local imported reference stays isolated by account, project and asset and is submitted as a file',async()=>{
 const core=await import('../core/collabStore.js'),references=await import('../core/generationReferences.js');
 const values=new Map(),localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const helpers=new Function('localStorage','resolveAssetReference','autoReferences',prelude+'\nreturn {assetLocalReferenceKey,resolveAssetImageReference,assetImageReferences};')(localStorage,core.resolveAssetReference,references.autoReferences);
 const file={id:'local-image',kind:'image',filePath:'C:/managed-media/ref.png',name:'参考.png'};
 values.set(helpers.assetLocalReferenceKey('a','p','asset'),JSON.stringify(file));
 const asset={id:'asset',category:'character',name:'【人物-常服】',description:'服装：白衣。'};
 const ref=helpers.resolveAssetImageReference(asset,[asset],'__local__','p','a');
 assert.deepEqual(helpers.assetImageReferences(ref),[file]);
 assert.equal(helpers.resolveAssetImageReference(asset,[asset],'__local__','p','b'),null);
 assert.equal(helpers.resolveAssetImageReference(asset,[asset],'__local__','other','a'),null);
 assert.equal(helpers.resolveAssetImageReference({...asset,id:'other'},[asset],'__local__','p','a'),null);
});
