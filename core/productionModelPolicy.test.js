import test from 'node:test';import assert from 'node:assert/strict';
test('prompt chain persists spent attempts, fills only remaining work and resumes the next model',async()=>{
 const {runPromptModelChain}=await import('./productionModelPolicy.js'),run={status:'running',config:{promptProfileId:'main',promptAttempts:2,promptFallbacks:[{id:'a',modelId:'backup1',attempts:1},{id:'b',modelId:'backup2',attempts:2}]}},calls=[];
 let missing=['1-1','1-2'];const ctx={run,guard:()=>{},checkpoint:async()=>{},notice:async()=>{}};
 await runPromptModelChain({ctx,profiles:['main','backup1','backup2'].map(id=>({id})),remaining:()=>missing,generate:async model=>{calls.push([model.id,[...missing]]);if(model.id==='main'){missing=['1-2'];throw Error('connection refused');}if(model.id==='backup1')return;missing=[];}});
 assert.deepEqual(calls.map(c=>c[0]),['main','main','backup1','backup2']);assert.deepEqual(calls.at(-1)[1],['1-2']);
 missing=['1-2'];await assert.rejects(runPromptModelChain({ctx,profiles:['main','backup1','backup2'].map(id=>({id})),remaining:()=>missing,generate:async model=>{calls.push([model.id]);throw Error('down');}}),/备用|用尽/);assert.equal(calls.at(-1)[0],'backup2');assert.equal(calls.length,5);
});
test('image fallback list explicitly empty means primary only; legacy single backup keeps settings',async()=>{
 const {modelFallbackSteps,modelPolicyIssues}=await import('./productionModelPolicy.js');
 const c={imageModel:'main',fallbackImageModel:'old',imageAttempts:2,imageConcurrency:4,imageRatio:'16:9'};
 assert.equal(modelFallbackSteps(c,'image')[0].modelId,'old');assert.deepEqual(modelFallbackSteps({...c,imageFallbacks:[]},'image'),[]);
 assert(modelPolicyIssues({...c,imageFallbacks:[{modelId:'bad',attempts:0,imageConcurrency:0}]},'image',[{id:'main'}]).length>=2);
});
