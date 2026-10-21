const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const {parsePromptBook}=await import('../core/promptBook.js');
 const {matchBasicReferences}=await import('../core/automaticReferences.js');
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']}),results=[];
 try{
  for(const width of [1280,1700]){
   const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(12000);
   await page.goto('http://127.0.0.1:5835/qa/imported-art-binding.html');
   await page.getByRole('button',{name:'上传提示词并先关联图片',exact:true}).click();
   await page.getByRole('button',{name:'导入整部素材文件夹',exact:true}).click();
   await page.getByRole('button',{name:'1-1-2',exact:true}).click();
   const panel=page.getByRole('region',{name:'提示词与图片独立关联'});
   const currentButton=panel.getByRole('button',{name:'AI 只关联当前条目（1-1-2）',exact:true});
   await currentButton.waitFor();await panel.screenshot({path:`../../output/imported-art-current-${width}.png`});
   await currentButton.click();await page.getByText('AI 关联结果：1 条就绪，2 条待处理',{exact:true}).waitFor();
   const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-import-binding-state')).generationWorkflow.books[0]);
   assert.equal(saved.selectedEntryId,saved.entries[1].id);
   assert.deepEqual(Object.keys(saved.importedBinding.decisions),[saved.entries[1].id]);
   const requests=await page.evaluate(()=>qaImported.requests);
   assert.equal(requests[0].prompts.length,1);assert.equal(requests[0].prompts[0].label,'1-1-2');
   assert(requests.filter(r=>r.entry).every(r=>r.entry.id===saved.entries[1].id));
   await page.getByRole('button',{name:'生成视频',exact:true}).click();await page.waitForFunction(()=>qaImported.submits.length===1);
   assert.deepEqual(await page.evaluate(()=>qaImported.submits[0].references.map(ref=>ref.id)),['a','b','room','cup']);
   await page.getByRole('button',{name:'返回原编辑模式',exact:true}).click();await page.getByLabel('提示词',{exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'重新匹配素材',exact:true}).count(),1);
   // Reproduce a legacy cached draft with the screenshot's free-form filenames.
   const names=['道格拉斯-定制西装','莱莉-考务监督职业装','沃伦-主席台讲话','女保安-工作制服','蔡斯-正式西装','媒体记者-采访群体'];
   const uri='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#7462b9"/></svg>');
   const refs=[...names,'广场主席台','莱莉-杯子'].map((name,i)=>({id:`old${i}`,name:`${i+1}-【${name}】.png`,kind:'image',url:uri}));
   const text='【30-2-1】【基础设定】\n人物：'+names.map(n=>n.split('-')[0]+'（参考@），站在主席台').join('；')+'。\n场景：日，外，广场主席台（参考@）。\n道具：无';
   const book=parsePromptBook(text,'截图回归','old');book.sceneMedia={'30-2':refs};
   const e=book.entries[0],draft=matchBasicReferences({prompt:e.prompt,references:refs.slice(0,7),autoReferenceExclusions:['image:old7']},refs);
   book.drafts[e.id]={...draft,prompt:e.prompt,autoReferenceSignature:draft.autoReferenceSignature.replace('basic-v2:','basic-v1:'),excludedIds:['old7']};
   await page.evaluate(book=>{const state=JSON.parse(localStorage.getItem('qa-import-binding-state'));state.generationWorkflow={books:[book],selectedBookId:book.id};localStorage.setItem('qa-import-binding-state',JSON.stringify(state));},book);
   await page.reload();const prompt=page.getByLabel('提示词',{exact:true});await prompt.waitFor();
   await page.waitForFunction(()=>document.querySelector('textarea[aria-label="提示词"]').value.includes('媒体记者（参考@image6）'));
   const actual=await prompt.inputValue();names.forEach((n,i)=>assert(actual.includes(`${n.split('-')[0]}（参考@image${i+1}）`),actual));
   assert(actual.includes('广场主席台（参考@image7）'));assert(!actual.includes('@image8'));
   assert.equal(await page.evaluate(()=>qaImported.ai),0);
   await page.locator('.generation-composer').screenshot({path:`../../output/imported-art-legacy-restored-${width}.png`});
   await page.reload();await prompt.waitFor();assert((await prompt.inputValue()).includes('媒体记者（参考@image6）'));
   assert.deepEqual(errors,[]);results.push({width,singleOnly:true,staysOnCurrent:true,legacySixRestored:true,cachedPlaceholderRepaired:true,noAIForLegacy:true,errors});await page.close();
  }
  fs.writeFileSync('../../output/imported-art-current-ui.json',JSON.stringify({passed:true,results},null,2));console.log(JSON.stringify({passed:true,results}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
