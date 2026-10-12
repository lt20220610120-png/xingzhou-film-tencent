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
test('MaxForAI 本地素材先上传再生成，使用官方字段、幂等键和受保护下载地址',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-maxforai-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const image=path.join(dir,'参考.png');fs.writeFileSync(image,'image-bytes');const calls=[];
 t.mock.method(global,'fetch',async(url,o)=>{calls.push({url,o});if(url.endsWith('/assets')){assert.equal(o.headers.Authorization,'Bearer max-key');assert.equal(await o.body.get('file').text(),'image-bytes');return Response.json({url:'https://cdn.max.test/reference.png'});}if(o.method==='POST')return Response.json({id:'max-task',status:'queued'});return Response.json({id:'max-task',status:'completed',metadata:{url:'https://signed.max.test/result.mp4'}});});
 const client=require('./video-provider.cjs'),base={endpoint:'https://maxforai.top/v1/video/generations',videoProtocol:'auto',apiKey:'max-key',model:'FT-2.5满血(过真人)',prompt:'人物参考@图片1，接续@视频1',duration:15,ratio:'16:9',resolution:'720p',references:[{kind:'image',filePath:image},{kind:'video',url:'https://cdn.max.test/clip.mp4'}]};
 const submitted=await client.submit({...base,idempotencyKey:'local-job-1'});assert.equal(submitted.jobId,'max-task');const create=calls.find(c=>c.url.endsWith('/videos'));assert.equal(create.o.headers['Idempotency-Key'],'local-job-1');assert.deepEqual(JSON.parse(create.o.body),{model:base.model,prompt:'人物参考@image1，接续@video1',duration:15,ratio:'16:9',resolution:'720p',images:['https://cdn.max.test/reference.png'],videos:['https://cdn.max.test/clip.mp4']});
 const result=await client.status({...base,jobId:'max-task'});assert.equal(result.status,'success');assert.equal(result.videoUrl,'https://maxforai.top/v1/videos/max-task/content');assert.equal(calls.filter(c=>c.o.method==='POST').length,2);
});
test('MaxForAI 鉴权下载只向原站发送密钥，跳转到 CDN 后不转发',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-max-download-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const calls=[];
 t.mock.method(global,'fetch',async(url,o)=>{calls.push({url,o});if(url.includes('maxforai.top'))return new Response(null,{status:302,headers:{location:'https://cdn.max.test/result.mp4'}});return new Response('video-bytes',{headers:{'content-type':'video/mp4'}});});
 const client=require('./video-provider.cjs');const saved=await client.download({endpoint:'https://maxforai.top/v1',videoProtocol:'maxforai',jobId:'max-task',url:'https://maxforai.top/v1/videos/max-task/content'},'max-key',dir);
 assert.equal(fs.readFileSync(saved,'utf8'),'video-bytes');assert.equal(calls[0].o.headers.Authorization,'Bearer max-key');assert.equal(calls[1].o.headers?.Authorization,undefined);
});
test('9Y 使用 seconds 与 reference 字段，Wan 视频素材携带时长并查询原任务',async t=>{
 const calls=[];t.mock.method(global,'fetch',async(url,o)=>{calls.push({url,o});return o.method==='POST'?Response.json({id:'9y-task',status:'queued'}):Response.json({id:'9y-task',status:'completed',progress:100});});
 const client=require('./video-provider.cjs'),base={endpoint:'https://9yapi.shop/v1/videos',videoProtocol:'auto',apiKey:'9y-key',model:'官转wan3.0-标准版',prompt:'镜头移动',duration:12,ratio:'9:16',resolution:'1080p',references:[{kind:'image',url:'https://cdn.test/a.png'},{kind:'video',url:'https://cdn.test/a.mp4',duration:6},{kind:'audio',url:'https://cdn.test/a.mp3'}]};
 assert.equal((await client.submit(base)).jobId,'9y-task');assert.deepEqual(JSON.parse(calls[0].o.body),{model:base.model,prompt:base.prompt,seconds:12,size:'1080P',aspect_ratio:'9:16',reference_images:[{url:'https://cdn.test/a.png',role:'reference_image'}],reference_videos:[{url:'https://cdn.test/a.mp4',duration:6}],reference_audios:['https://cdn.test/a.mp3']});
 const result=await client.status({...base,jobId:'9y-task'});assert.equal(result.videoUrl,'https://9yapi.shop/v1/videos/9y-task/content');assert.equal(calls.filter(c=>c.o.method==='POST').length,1);
});
test('9Y 在付费提交前拒绝本地素材和缺少时长的 Wan 视频素材',async t=>{
 let calls=0;t.mock.method(global,'fetch',async()=>{calls++;return Response.json({id:'unexpected'})});const client=require('./video-provider.cjs'),base={endpoint:'https://9yapi.shop/v1',videoProtocol:'niney',apiKey:'key',model:'官转wan3.0-标准版',prompt:'test',duration:5,ratio:'16:9',resolution:'720p'};
 await assert.rejects(client.submit({...base,references:[{kind:'image',filePath:'C:\\local.png'}]}),/公网 HTTPS/);await assert.rejects(client.submit({...base,references:[{kind:'video',url:'https:\/\/cdn.test\/clip.mp4'}]}),/需要填写.*时长/);assert.equal(calls,0);
});
test('9Y 从 Wan 切换其他型号保留本地素材时长但只提交 URL 字符串',async t=>{
 let body;t.mock.method(global,'fetch',async(_,options)=>{body=JSON.parse(options.body);return Response.json({id:'niney-other',status:'queued'});});
 await require('./video-provider.cjs').submit({endpoint:'https://9yapi.shop/v1',apiKey:'key',model:'JMVIP-2.5',prompt:'test',duration:15,ratio:'16:9',resolution:'720p',references:[{kind:'video',url:'https://cdn.test/clip.mp4',duration:6}]});
 assert.deepEqual(body.reference_videos,['https://cdn.test/clip.mp4']);
});
test('两家在任何素材读取或生成前拒绝本机和内网远程素材',async t=>{
 let calls=0;t.mock.method(global,'fetch',async()=>{calls++;return Response.json({id:'unexpected'})});const client=require('./video-provider.cjs');
 for(const endpoint of ['https://maxforai.top/v1','https://9yapi.shop/v1'])for(const url of ['http://public.test/a.png','https://localhost/a.png','https://127.0.0.1/a.png','https://192.168.1.5/a.png','https://[::1]/a.png','https://[::ffff:127.0.0.1]/a.png']){
  await assert.rejects(client.submit({endpoint,apiKey:'key',model:'future-video',prompt:'test',duration:15,ratio:'16:9',resolution:'720p',references:[{kind:'image',url}]}),/公网 HTTPS/);
 }
 assert.equal(calls,0);
});
test('MaxForAI 兼容外层 success 和 data 任务结果，9Y 失败原因保留且隐藏密钥',async t=>{
 const client=require('./video-provider.cjs');let failed=false;t.mock.method(global,'fetch',async()=>Response.json(failed?{id:'failed-task',status:'failed',error:{message:'quota failure key-fixture'}}:{code:'success',data:{id:'wrapped-task',status:'completed',result_url:'https://cdn.max.test/result.mp4'}}));
 const max=await client.status({endpoint:'https://maxforai.top/v1',apiKey:'key-fixture',jobId:'wrapped-task'});assert.equal(max.status,'success');assert.equal(max.jobId,'wrapped-task');assert.equal(max.videoUrl,'https://maxforai.top/v1/videos/wrapped-task/content');
 failed=true;const niney=await client.status({endpoint:'https://9yapi.shop/v1',apiKey:'key-fixture',jobId:'failed-task'});assert.equal(niney.status,'failed');assert.match(niney.errorMessage,/quota failure/);assert.ok(!niney.errorMessage.includes('key-fixture'));
});
