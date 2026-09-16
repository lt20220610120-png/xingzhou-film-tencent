const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ui=fs.readFileSync(path.join(__dirname,'../src/v06/CollabWorkspace.jsx'),'utf8').replace(/\r\n/g,'\n');
const singleSource=ui.slice(ui.indexOf('function AssetImageBox('),ui.indexOf('function ManualAssetDialog('));
const batchSource=ui.slice(ui.indexOf('function ArtSection('),ui.indexOf('function AssetsSection('));
const referencePrelude=ui.slice(ui.indexOf('const assetReferenceKey ='),ui.indexOf('function AssetImageBox('));
function declaration(source,name){
  const match=source.match(new RegExp(`\\bconst ${name}\\s*=[^;]+;`));
  assert.ok(match,`real UI declaration ${name} exists`);
  return match[0];
}
function entry(source,name){
  const match=source.match(new RegExp(`const ${name} = async \\(\\) => \\{[\\s\\S]*?\\n  \\};`));
  assert.ok(match,`real UI entry ${name} exists`);
  return match[0];
}
// Execute the actual shipped entry closures and their reference declarations;
// only platform/media IO and React state setters are replaced by offline seams.
function compileEntry(core,scope,kind){
  const names=Object.keys({...core,...scope});
  const values=Object.values({...core,...scope});
  const body=kind==='single'
    ? [referencePrelude,declaration(singleSource,'refAsset'),declaration(singleSource,'referenceRequired'),declaration(singleSource,'explicitlyNoReference'),entry(singleSource,'generate'),'return generate;'].join('\n')
    : [referencePrelude,entry(batchSource,'generateBatch'),'return generateBatch;'].join('\n');
  return new Function(...names,body)(...values);
}
async function fixture(kind,{cancel=false,baseImage=false,baseline=false,mode='single'}={}){
  const core=await import('../core/collabStore.js');
  const references=await import('../core/generationReferences.js');
  const output='### 第1集\n人物：\n- 【林夏-常服】（实际出镜，首次）脸型：圆脸；发型：黑发；服装：白衬衣。\n场景：\n- 无（本集未出现）\n道具：\n- 无（本集未出现）\n### 第2集\n人物：\n- 【林夏-礼服】（实际出镜，首次，换装）脸型：圆脸；发型：黑发；服装与鞋履：红色礼服与银色鞋履；妆造差异：红唇。\n场景：\n- 无（本集未出现）\n道具：\n- 无（本集未出现）';
  const rows=core.buildAssetRows(core.parseArtAnalysis(output)).map((row,index)=>({...row,id:index?'gown':'base',images:[]}));
  if(baseImage)rows[0].images=[{id:'real-baseline',url:'https://example.test/base.png'}];
  const assets=core.normalizeArtAssets(rows);
  const asset=assets[baseline?0:1];
  if(!baseline){assert.doesNotMatch(asset.description,/脸型|发型/);assert.equal(asset.generationDescription,undefined);assert.doesNotMatch(asset.description,/参考【/);}
  asset.description=core.serializeAssetPrompt({mode,prefix:'',content:asset.description});
  const calls=[],errors=[],busyStates=[];
  let busyIds=new Set();
  const setGeneratingAssetIds=update=>{busyIds=update(busyIds);};
  const scope={
    ...references,project:{id:'ui-offline',style:'AI真人'},asset,assets,refId:cancel?'':null,
    localStorage:{getItem:()=>cancel?'':null},generating:false,busy:false,canEdit:true,size:'1024x1024',
    profile:{id:'offline',model:'mock'},batchProfile:{id:'offline',model:'mock'},batchSize:'1024x1024',episode:baseline?1:2,
    batchSelectedIds:[asset.id],batchBusy:false,generatingAssetIdsRef:{current:new Set()},setGeneratingAssetIds,
    setError:value=>errors.push(value),setExportError:value=>errors.push(value),setBusy:value=>busyStates.push(value),setBatchBusy:()=>{},
    readableCloudError:error=>error.message,beforeGenerate:null,onGenerateImage:null,refresh:async()=>{},
    draftStore:{read:()=>null,save:async()=>{throw new Error('fixture has no draft');}},
    api:{mediaGenerateImage:async payload=>{calls.push(payload);return {};},collabAttachGeneratedAssetImage:async()=>{throw new Error('fixture must not attach');}},
  };
  await compileEntry(core,scope,kind)();
  const hint=singleSource.match(/\{(referenceRequired[^{}]+explicitlyNoReference)&&<small className="collab-ref-hint">([^<]+)<\/small>\}/);
  assert.ok(hint,'actual no-reference risk hint exists');
  const names=Object.keys({...core,...scope}),values=Object.values({...core,...scope});
  const riskVisible=new Function(...names,[referencePrelude,declaration(singleSource,'refAsset'),declaration(singleSource,'referenceRequired'),declaration(singleSource,'explicitlyNoReference'),`return Boolean(${hint[1]});`].join('\n'))(...values);
  return {calls,errors,busyIds,locked:scope.generatingAssetIdsRef.current,riskNotice:riskVisible?hint[2]:''};
}
for(const kind of ['single','batch']){
  for(const mode of ['single','group','free']){
  test(`v228 actual ${kind} entry (${mode}): missing baseline image makes ZERO media API calls`,async()=>{
    const result=await fixture(kind,{mode});
    assert.equal(result.calls.length,0,'difference-only wardrobe must not pay without a baseline or explicit cancellation');
    assert.match(result.errors.join('\n'),/基准参考图/);
    assert.equal(result.locked.size,0);
  });
  test(`v228 actual ${kind} entry (${mode}): explicit no-reference selection permits generation with risk hint`,async()=>{
    const result=await fixture(kind,{cancel:true,mode});
    assert.equal(result.calls.length,1);
    assert.deepEqual(result.calls[0].references,[]);
    assert.match(result.calls[0].prompt,/红色礼服与银色鞋履/);
    assert.match(result.riskNotice,/已明确不引用参考.*不会锁定身份一致性/);
  });
  }
  test(`v228 actual ${kind} entry: real baseline is sent as a reference image`,async()=>{
    const result=await fixture(kind,{baseImage:true});
    assert.equal(result.calls.length,1);
    assert.equal(result.calls[0].references.length,1);
    assert.ok(JSON.stringify(result.calls[0].references).includes('https://example.test/base.png'));
  });
  test(`v228 actual ${kind} entry: the first wardrobe does not require its own reference`,async()=>{
    const result=await fixture(kind,{baseline:true});
    assert.equal(result.calls.length,1);
    assert.deepEqual(result.calls[0].references,[]);
  });
}
