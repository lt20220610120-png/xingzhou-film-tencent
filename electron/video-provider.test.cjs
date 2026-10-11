const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
test('新型号与特殊上游映射可提交并通过同一任务号查询，密钥不持久化',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-video-provider-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const calls=[];
 t.mock.method(global,'fetch',async(url,o)=>{calls.push({url,o});if(o.method==='POST')return Response.json({ticket:{key:'task-new'}});if(url.includes('/check/'))return Response.json({phase:'READY',artifact:{video:'https://cdn.example.test/movie.mp4'}});return new Response('mock-mp4',{headers:{'content-type':'video/mp4'}});});
 const api=require('./generation-jobs.cjs').createGenerationJobs(dir);
 const job=await api.submit({kind:'video',endpoint:'https://new.example.test/api',apiKey:'do-not-store',model:'brand-new-model',profileId:'self',prompt:'运镜',duration:7,ratio:'16:9',resolution:'720p',videoProtocol:'custom',videoAdapter:{submitPath:'render',queryPath:'check/{{taskId}}',bodyType:'json',authMode:'header',authHeader:'x-api-key',authPrefix:'',requestTemplate:{engine:'{{model}}',words:'{{prompt}}',length:'{{duration}}'},response:{taskId:'ticket.key',status:'phase',url:'artifact.video'},successStatuses:['READY'],failedStatuses:['BAD']}});
 assert.equal(job.jobId,'task-new');assert.equal(job.status,'submitted');assert.equal(calls.length,1);assert.equal(calls[0].o.headers['x-api-key'],'do-not-store');assert.equal(JSON.parse(calls[0].o.body).engine,'brand-new-model');
 const recreated=require('./generation-jobs.cjs').createGenerationJobs(dir);const done=await recreated.refresh({id:job.id,apiKey:'do-not-store',endpoint:'https://new.example.test/api'});assert.equal(done.status,'success');assert.equal(calls.filter(c=>c.o.method==='POST').length,1);assert.equal(calls.at(-1).o.headers?.['x-api-key'],undefined);assert.ok(!fs.readFileSync(path.join(dir,'generation-jobs.json'),'utf8').includes('do-not-store'));
});
test('从未内置的新ft型号按用户拉取能力发起任务，并可重启查询',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-ft-future-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let submitted;
 t.mock.method(global,'fetch',async(url,o)=>{if(o.method==='POST'){submitted=JSON.parse(o.body);return Response.json({success:true,jobId:'future'});}if(url.includes('/status'))return Response.json({status:'success',videoUrl:'https://cdn.test/future.mp4'});return new Response('mp4',{headers:{'content-type':'video/mp4'}});});
 const jobs=require('./generation-jobs.cjs').createGenerationJobs(dir);const job=await jobs.submit({endpoint:'https://feituokuajing.com/api/open/v1',apiKey:'fixture',kind:'video',model:'ft-video-v1-not-bundled',prompt:'test',duration:27,resolution:'900p',ratio:'16:9',videoProtocol:'feituo',modelCapabilities:{durations:[27],resolutions:['900p'],ratios:['16:9'],maxImages:12,maxVideos:0,maxAudios:0}});assert.equal(submitted.model,'ft-video-v1-not-bundled');assert.equal(submitted.duration,27);
 const done=await require('./generation-jobs.cjs').createGenerationJobs(dir).refresh({id:job.id,apiKey:'fixture',endpoint:'https://feituokuajing.com/api/open/v1'});assert.equal(done.status,'success');
});
test('Ark和Videos multipart携带本地首帧，不丢文件或改错模板',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-video-frame-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'frame.png');fs.writeFileSync(file,'frame');const calls=[];
 t.mock.method(global,'fetch',async(url,o)=>{calls.push({url,o});return Response.json({id:'job'});});const api=require('./video-provider.cjs');const input={endpoint:'https://provider.test/v1',apiKey:'fixture',model:'not-bundled',prompt:'test',duration:5,ratio:'9:16',resolution:'720p',references:[{kind:'image',filePath:file}]};
 await api.submit({...input,videoProtocol:'ark'});assert.match(JSON.parse(calls[0].o.body).content[1].image_url.url,/^data:image\/png;base64,/);
 await api.submit({...input,videoProtocol:'videos-multipart'});assert.equal(await calls[1].o.body.get('input_reference').text(),'frame');assert.equal(calls[1].o.headers['Content-Type'],undefined);assert.equal(calls[1].o.body.get('size'),'720x1280');
});
test('Videos JSON把首帧发送到上游，不静默丢掉素材',async t=>{
 let body;t.mock.method(global,'fetch',async(_,o)=>{body=JSON.parse(o.body);return Response.json({id:'job',status:'queued'});});
 await require('./video-provider.cjs').submit({endpoint:'https://provider.test/v1',apiKey:'fixture',model:'new-video',prompt:'test',duration:5,ratio:'16:9',resolution:'720p',videoProtocol:'videos-json',references:[{kind:'image',url:'https://cdn.test/frame.png'}]});assert.equal(body.input_reference,'https://cdn.test/frame.png');
});
test('自定义GET提交编码字段到查询串，PUT查询保留JSON任务参数',async t=>{
 const calls=[];t.mock.method(global,'fetch',async(url,o)=>{calls.push({url,o});return Response.json({id:'job',status:'queued'});});const client=require('./video-provider.cjs');
 const input={endpoint:'https://service.test/api',model:'new',prompt:'a & b',apiKey:'fixture',duration:5,videoProtocol:'custom',videoAdapter:{submitPath:'create',submitMethod:'GET',queryPath:'check',queryMethod:'PUT',bodyType:'json',requestTemplate:{prompt:'{{prompt}}'},queryTemplate:{ticket:'{{taskId}}'}}};
 await client.submit(input);assert.equal(new URL(calls[0].url).searchParams.get('prompt'),'a & b');assert.equal(calls[0].o.body,undefined);
 await client.status({...input,jobId:'job'});assert.equal(JSON.parse(calls[1].o.body).ticket,'job');
});
test('直返地址下载失败后可恢复；编辑配置换站后旧任务不会收到新密钥',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-video-direct-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let downloads=0,posts=0;
 t.mock.method(global,'fetch',async(url,o)=>{if(o.method==='POST'){posts++;return Response.json({video_url:'https://cdn.test/movie.mp4'});}downloads++;if(downloads<=3)throw Error('network lost');return new Response('mp4',{headers:{'content-type':'video/mp4'}});});
 const manager=require('./generation-jobs.cjs').createGenerationJobs(dir),job=await manager.submit({kind:'video',endpoint:'https://a.test/v1',apiKey:'fixture',model:'new',prompt:'test',duration:5,videoProtocol:'videos-json'});assert.equal(job.status,'downloading');
 const done=await manager.refresh({id:job.id,apiKey:'fixture',endpoint:'https://a.test/v1'});assert.equal(done.status,'success');assert.equal(posts,1);
 let queried=0;t.mock.method(global,'fetch',async(_,o)=>{if(o.method==='POST')return Response.json({id:'pending'});queried++;return Response.json({status:'queued'});});
 const pending=await manager.submit({kind:'video',endpoint:'https://a.test/v1',apiKey:'fixture',model:'new',prompt:'test',duration:5,videoProtocol:'videos-json'});
 const retained=await manager.refresh({id:pending.id,apiKey:'key-for-b',endpoint:'https://b.test/v1'});assert.equal(queried,0);assert.match(retained.warning,/地址.*变化/);
});
test('提交失败不切换协议重试付费；跨主机模板拒绝转发密钥',async t=>{
 let posts=0;t.mock.method(global,'fetch',async()=>{posts++;throw Error('network lost')});const client=require('./video-provider.cjs');
 await assert.rejects(client.submit({model:'new',endpoint:'https://api.example.test',apiKey:'test',prompt:'test',duration:5,videoProtocol:'custom',videoAdapter:{submitPath:'https://other.example.test/render',bodyType:'json',requestTemplate:{prompt:'{{prompt}}'}}}),/同一服务商/);assert.equal(posts,0);
 await assert.rejects(client.submit({model:'new',endpoint:'https://api.example.test/v1',apiKey:'test',prompt:'test',duration:5,videoProtocol:'videos-json'}));assert.equal(posts,1);
});
test('旧ft任务不向原服务商发送新站密钥；复用结果不继承旧任务号',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-video-legacy-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const id='legacy',model='ft-video-v1-69ef4c70291248a25c8198cd1c7c9c1f';fs.writeFileSync(path.join(dir,'generation-jobs.json'),JSON.stringify([{id,kind:'video',model,status:'submitted',jobId:'old-job'}]));let calls=0;t.mock.method(global,'fetch',async()=>{calls++;throw Error('network lost')});
 const manager=require('./generation-jobs.cjs').createGenerationJobs(dir);await manager.refresh({id,apiKey:'key-for-new-site',endpoint:'https://other.test/v1'});assert.equal(calls,0);
 await assert.rejects(manager.submit({endpoint:'https://feituokuajing.com',kind:'video',apiKey:'fixture',model,prompt:'new generation',duration:5,resolution:'720p',ratio:'16:9',jobId:'old-job',filePath:'old.mp4'}));const newJob=manager.list().find(j=>j.id!==id);assert.equal(newJob.status,'uncertain');assert.equal(newJob.jobId,undefined);assert.equal(newJob.filePath,undefined);
});
test('不同上游可用query或body鉴权，密钥只在实际请求注入',async t=>{
 const calls=[];t.mock.method(global,'fetch',async(url,o)=>{calls.push({url,o});return Response.json({id:'job'});});const client=require('./video-provider.cjs');const base={endpoint:'https://service.test/api',model:'new',prompt:'test',duration:5,apiKey:'fixture-key',videoProtocol:'custom'};
 await client.submit({...base,videoAdapter:{authMode:'query',authField:'key',submitPath:'create',bodyType:'json',requestTemplate:{model:'{{model}}'}}});assert.equal(new URL(calls[0].url).searchParams.get('key'),'fixture-key');assert.equal(calls[0].o.headers.Authorization,undefined);
 await client.submit({...base,videoAdapter:{authMode:'body',authField:'api_key',submitPath:'create',bodyType:'json',requestTemplate:{model:'{{model}}'}}});assert.equal(JSON.parse(calls[1].o.body).api_key,'fixture-key');
});
