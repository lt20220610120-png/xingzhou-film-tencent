const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ui=fs.readFileSync(path.join(__dirname,'../src/v06/CollabWorkspace.jsx'),'utf8').replace(/\r\n/g,'\n');
const single=ui.slice(ui.indexOf('function AssetImageBox('),ui.indexOf('function ManualAssetDialog('));
const prelude=ui.slice(ui.indexOf('const assetReferenceKey ='),ui.indexOf('function AssetImageBox('));
const declaration=(s,n)=>s.match(new RegExp(`\\bconst ${n}\\s*=[^;]+;`))[0];
const entry=(s,n)=>s.match(new RegExp(`const ${n} = async \\([^)]*\\) => \\{[\\s\\S]*?\\n  \\};`))[0];
async function run(kind,{baseline=false,baseImage=false,cancel=false,recovering=false,wardrobe=false}={}){
 const core=await import('../core/collabStore.js'),refs=await import('../core/generationReferences.js');
 const {requiresWardrobeBaselineImage}=await import('../core/artImageBatch.js');
 const raw=wardrobe
  ?'### 第1集\n人物：\n- 【阿禾】脸型：方脸；服装：白衬衫。\n- 【阿禾-雨衣】参考【阿禾】；服装：蓝色雨衣。\n场景：\n- 无\n道具：\n- 无'
  :'### 第1集\n人物：\n- 无\n场景：\n- 【神话擂台-外】（首次）空间布局：圆形擂台中央石台、两侧阶梯观众席；材质：灰色石材。\n- 【神话擂台-日-外】（首次）空间布局：不应重新设计；时间/光线：白日直射光。\n道具：\n- 无';
 const assets=core.normalizeArtAssets(core.buildAssetRows(core.parseArtAnalysis(raw)).map((a,i)=>({...a,id:i?'day':'base',images:[]})));
 if(baseImage)assets[0].images=[{id:'first',url:'https://example.test/arena.png'}];
 if(wardrobe)assets[0].noReferenceImage=true;
 else assert.equal(assets[1].description,'时间/光线：白日直射光。');
 const asset=assets[baseline?0:1],calls=[],errors=[];
 const readRecovery=()=>recovering?{receiptId:'old-result'}:null;
 const scope={...core,...refs,requiresWardrobeBaselineImage,asset,assets,refId:cancel?'':null,project:{id:'scene-test',style:''},accountId:'a',pendingImage:readRecovery(),
  localStorage:{getItem:()=>cancel?'':null},readAssetImageRecovery:readRecovery,clearAssetImageRecovery:()=>{},
  requestAssetImage:async(api,p,a,payload)=>{calls.push(recovering?'recover':payload);return {filePath:'saved.png'};},
  api:{collabAttachGeneratedAssetImage:async()=>({id:'attached',url:'https://example.test/saved.png'})},
  generating:false,busy:false,canEdit:true,profile:{id:'mock'},size:'1024x1024',beforeGenerate:null,onGenerateImage:null,
  setError:e=>errors.push(e),setBusy:()=>{},setLocalImages:()=>{},setSelectedImageId:()=>{},refresh:async()=>{},readableCloudError:e=>e.message,projectCharacterComposition:()=>({})};
 if(kind==='single'){
  const body=[prelude,declaration(single,'refAsset'),declaration(single,'referenceRequired'),declaration(single,'explicitlyNoReference'),entry(single,'generate'),'return generate;'];
  await new Function(...Object.keys(scope),body.join('\n'))(...Object.values(scope))();
 }else{
  const {assetImageActivity}=await import('../core/assetImageActivity.js');
  const activity=assetImageActivity(crypto.randomUUID(),scope.accountId);
  Object.assign(scope,{buildImagePrompt:core.buildImagePrompt});
  const start=new Function(...Object.keys(scope),prelude+'\nreturn startWorkspaceImageBatch;')(...Object.values(scope));
  await start({...scope,activity,jobs:[{asset}],label:'fixture',draftStore:{read:()=>null},concurrency:1});
  errors.push(...activity.snapshot().batches.flatMap(batch=>batch.failures.map(row=>row.error)));
 }
 return {calls,errors};
}

test('batch wardrobe generates without an exempt baseline’s image when no reference is selected',async()=>{
 const result=await run('batch',{wardrobe:true});
 assert.deepEqual(result.errors,[]);
 assert.equal(result.calls.length,1);
 assert.deepEqual(result.calls[0].references,[]);
});
for(const kind of ['single','batch']){
 test(`${kind} scene lighting variant without a base image makes zero paid calls`,async()=>{const r=await run(kind);assert.equal(r.calls.length,0);assert.match(r.errors.join('\n'),/场景基准参考图/);});
 test(`${kind} scene lighting variant sends the actual base image`,async()=>{const r=await run(kind,{baseImage:true});assert.equal(r.calls.length,1);assert.equal(r.calls[0].references[0].assetId,'base');});
 test(`${kind} explicit scene no-reference option remains available`,async()=>{const r=await run(kind,{cancel:true});assert.equal(r.calls.length,1);assert.deepEqual(r.calls[0].references,[]);});
 test(`${kind} first scene baseline requires no self-reference`,async()=>{const r=await run(kind,{baseline:true});assert.equal(r.calls.length,1);});
 test(`${kind} scene recovery saves the original result without paying again`,async()=>{const r=await run(kind,{recovering:true});assert.deepEqual(r.calls,['recover']);});
}
