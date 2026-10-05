const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');

const moduleFile = path.join(__dirname, 'gemini-web.cjs');
const api = () => fs.existsSync(moduleFile) ? require(moduleFile) : {};
const frame = parts => {
  const content = `\n${JSON.stringify(parts)}`;
  return `${content.length}${content}\n`;
};
const statusFrame = (status = 1000) => {
  const body = Array(18).fill(null);
  body[14] = status;
  body[15] = [['account-pro-id', 'Pro', 'Deep model', null, null, null, null, null, null, null, null, 'Pro', null, null, null, null, null, 3], ['account-fast-id', 'Fast', 'Fast model']];
  body[16] = [8];
  return `)]}'\n${frame([['wrb.fr', 'otAQ7b', JSON.stringify(body)]])}`;
};

test('Gemini parses account model names and tier from the current web RPC', () => {
  assert.equal(typeof api().parseUserStatus, 'function');
  const result = api().parseUserStatus(statusFrame());
  assert.equal(result.loggedIn, true);
  assert.deepEqual(result.models.map(model => ({id:model.id,name:model.name})), [{id:'account-pro-id',name:'Pro'},{id:'account-fast-id',name:'Fast'}]);
  assert.equal(result.models[0].capacity, 2);
  assert.equal(api().parseUserStatus(statusFrame(1016)).loggedIn, false);
});

test('Gemini distinguishes the final text from thoughts and interrupted output', () => {
  assert.equal(typeof api().parseGeneratedText, 'function');
  const candidate = Array(38).fill(null);
  candidate[0] = 'candidate'; candidate[1] = ['正文含有😀和换行\n完成']; candidate[8] = [2]; candidate[37] = [['private-thoughts']];
  const body = Array(28).fill(null); body[4] = [candidate];
  const response = `)]}'\n${frame([['wrb.fr',null,JSON.stringify(body)]])}`;
  assert.equal(api().parseGeneratedText(response), '正文含有😀和换行\n完成');
  candidate[8] = [1];
  assert.throws(() => api().parseGeneratedText(frame([['wrb.fr',null,JSON.stringify(body)]])), error => error.code==='OUTPUT_TRUNCATED' && error.partialText==='正文含有😀和换行\n完成');
  assert.throws(() => api().parseGeneratedText(frame([['wrb.fr',null,JSON.stringify(body)]])+'999\n[["broken'), error => error.code==='OUTPUT_TRUNCATED' && error.partialText==='正文含有😀和换行\n完成');
  assert.throws(() => api().parseGeneratedText(frame([['wrb.fr',null,null,null,null,[null,null,[[null,[1037]]]]]])), /额度/);
});

test('Gemini protocol sends a fresh temporary chat and preserves the selected account model', () => {
  assert.equal(typeof api().buildGenerateRequest, 'function');
  const result = api().buildGenerateRequest('测试正文', {id:'account-pro-id',capacity:2,capacityField:12,modelNumber:3}, 'test-session');
  const payload = JSON.parse(JSON.parse(result.body)[1]);
  assert.equal(payload.length, 81);
  assert.equal(payload[0][0], '测试正文');
  assert.equal(payload[45], 1);
  assert.equal(payload[79], 3);
  assert.equal(JSON.parse(result.headers['x-goog-ext-525001261-jspb'])[4], 'account-pro-id');
  // Golden field positions from upstream build_model_header: capacity_field is
  // one-based JSPB numbering, followed by model_number and session fields.
  assert.deepEqual(JSON.parse(result.headers['x-goog-ext-525001261-jspb']),[1,null,null,null,'account-pro-id',null,null,0,[4,5,6,8],null,null,2,null,null,3,1,'test-session']);
  const tier13=api().buildGenerateRequest('测试正文',{id:'account-pro-id',capacity:2,capacityField:13,modelNumber:3},'test-session');
  assert.deepEqual(JSON.parse(tier13.headers['x-goog-ext-525001261-jspb']),[1,null,null,null,'account-pro-id',null,null,0,[4,5,6,8],null,null,null,2,null,null,3,1,'test-session']);
  assert.deepEqual(payload[2], ['', '', '', null, null, null, null, null, null, '']);
});

test('Gemini rejects a missing browser and cancellation without opening a user browser', async t => {
  assert.equal(typeof api().createGeminiWebService, 'function');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-gemini-test-'));
  t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
  let launches = 0;
  const service = api().createGeminiWebService({profileDir:dir,findBrowser:()=>null,spawn:()=>{launches++;}});
  const status = await service.status();
  assert.equal(status.installed,false);
  await assert.rejects(service.request({messages:[{role:'user',content:'Hello'}]}),/Edge|Chrome/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(service.request({messages:[{role:'user',content:'Hello'}]},{signal:controller.signal}), error => error.name === 'AbortError');
  assert.equal(launches,0);
  await service.close();
});

function fakeBrowser(dir, settings = {}) {
  const launches = [], sockets = [];
  let active = 0, peak = 0, cancellations = 0;
  const candidate = Array(9).fill(null); candidate[0] = 'test-candidate'; candidate[1] = ['连接成功']; candidate[8] = [2];
  const body = Array(5).fill(null); body[4] = [candidate];
  const raw = frame([['wrb.fr', null, JSON.stringify(body)]]);
  class Socket extends EventTarget {
    constructor() { super(); this.readyState = 0; sockets.push(this); queueMicrotask(() => {this.readyState = 1;this.dispatchEvent(new Event('open'));}); }
    send(input) {
      const message = JSON.parse(input);
      const reply = value => queueMicrotask(() => this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({id:message.id,result:value})})));
      if(message.method==='Target.getTargets') return reply({targetInfos:[{type:'page',targetId:'app-owned-page'}]});
      if(message.method==='Target.attachToTarget') return reply({sessionId:'app-owned-session'});
      if(message.method==='Page.reload')return reply({});
      if(message.method==='Browser.close') { const close = () => {reply({}); const child=launches.at(-1).child;child.exitCode=0;child.emit('exit',0);}; if(settings.closeDelay) setTimeout(close,settings.closeDelay);else close();return; }
      assert.equal(message.method,'Runtime.evaluate');
      const expression=message.params.expression;
      if(expression==='performance.timeOrigin')return reply({result:{value:1}});
      if(expression.startsWith('({timeOrigin:'))return reply({result:{value:{timeOrigin:2,ready:'complete'}}});
      if(expression.startsWith('({ready:')) return reply({result:{value:{ready:'complete',origin:'https://gemini.google.com',token:true}}});
      if(expression.includes("})('status',")) return reply({result:{value:{ok:true,raw:statusFrame()}}});
      if(expression.includes("})('generate',")) {
        active++;peak=Math.max(peak,active);
        const result=settings.generateResult ? settings.generateResult(raw) : {ok:true,raw};
        const timer=setTimeout(()=>{active--;reply({result:{value:result}});this.cancel=null;},40);
        this.cancel=()=>{clearTimeout(timer);active--;reply({result:{value:{ok:false,code:'ABORTED'}}});this.cancel=null;};return;
      }
      if(expression.includes('controller?.abort()')) {cancellations++;this.cancel?.();return reply({result:{value:true}});}
      return reply({result:{value:12}});
    }
    close() {this.readyState=3;this.dispatchEvent(new Event('close'));}
  }
  return {
    dependencies:{profileDir:dir,findBrowser:()=>'/fake/edge',WebSocket:Socket,spawn:(executable,args,options)=>{
      const child=new EventEmitter();child.exitCode=null;child.kill=()=>{child.exitCode=0;child.emit('exit',0);};
      launches.push({executable,args,options,child});
      fs.writeFileSync(path.join(dir,'DevToolsActivePort'),'12345\n/devtools/browser/test-browser');
      return child;
    }},launches,get peak(){return peak;},get cancellations(){return cancellations;},
  };
}

test('Gemini runs quietly in an owned profile, serializes quota requests, and opens login explicitly', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-gemini-lifecycle-'));
  const fake=fakeBrowser(dir),service=api().createGeminiWebService(fake.dependencies);
  t.after(async()=>{await service.close();fs.rmSync(dir,{recursive:true,force:true});});
  const status=await service.status();
  assert.equal(status.loggedIn,true);
  assert.deepEqual(Object.keys(status.models[0]).sort(),['id','modelName','name']);
  assert.equal(fake.launches.length,1);
  assert.equal(fake.launches[0].options.windowsHide,true);
  assert.equal(fake.launches[0].args.includes('--headless=new'),true);
  const config={model:'account-pro-id',messages:[{role:'user',content:'只回复连接成功'}]};
  assert.deepEqual(await Promise.all([service.request(config),service.request(config)]),['连接成功','连接成功']);
  assert.equal(fake.peak,1);
  assert.equal(fake.launches.length,1);
  await service.openLogin();
  assert.equal(fake.launches.length,2);
  assert.equal(fake.launches[1].options.windowsHide,false);
  assert.equal(fake.launches[1].args.includes('--headless=new'),false);
  assert.equal(fake.launches[1].args.some(argument=>argument.includes('remote-debugging')),false);
  assert.equal(fake.launches[1].args.includes('--disable-background-mode'),true);
  const duringLogin=await service.status();
  assert.equal(duringLogin.loggedIn,false);
  assert.match(duringLogin.message,/关闭.*刷新/);
  assert.equal(fake.launches.length,2);
});

test('Gemini refreshes and replays an explicit 1095 rejection once, without changing model or exposing login UI',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-gemini-1095-'));let calls=0;
 const rejection=frame([['wrb.fr',null,null,null,null,[null,null,[[null,[1095]]]]]]);
 const fake=fakeBrowser(dir,{generateResult:raw=>({ok:true,raw:++calls===1?rejection:raw})});
 const service=api().createGeminiWebService(fake.dependencies);t.after(async()=>{await service.close();fs.rmSync(dir,{recursive:true,force:true});});
 assert.equal(await service.request({model:'account-pro-id',messages:[{role:'user',content:'任务'}]}),'连接成功');
 assert.equal(calls,2);assert.equal(fake.launches.length,1);assert.ok(fake.launches[0].args.includes('--headless=new'));
});
test('persistent Gemini 1095 rejection is bounded and requires user reauthentication',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-gemini-rejected-'));let calls=0;
 const rejection=frame([['wrb.fr',null,null,null,null,[null,null,[[null,[1095]]]]]]);
 const fake=fakeBrowser(dir,{generateResult:()=>{calls++;return {ok:true,raw:rejection};}}),service=api().createGeminiWebService(fake.dependencies);
 t.after(async()=>{await service.close();fs.rmSync(dir,{recursive:true,force:true});});
 await assert.rejects(service.request({messages:[{role:'user',content:'任务'}]}),e=>e.code==='GEMINI_SESSION_REJECTED'&&/重新验证/.test(e.message));assert.equal(calls,2);
});

test('Gemini cancellation aborts the browser fetch and permits the next request', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-gemini-cancel-'));
  const fake=fakeBrowser(dir),service=api().createGeminiWebService(fake.dependencies);
  t.after(async()=>{await service.close();fs.rmSync(dir,{recursive:true,force:true});});
  await service.status();
  const controller=new AbortController();
  const config={messages:[{role:'user',content:'长任务'}]};
  const pending=service.request(config,{signal:controller.signal});
  await new Promise(resolve=>setTimeout(resolve,10));controller.abort();
  await assert.rejects(pending,error=>error.name==='AbortError');
  assert.equal(fake.cancellations,1);
  assert.equal(await service.request(config),'连接成功');
});

test('Gemini shutdown stops its helper immediately during an active request', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-gemini-shutdown-'));
  const fake=fakeBrowser(dir),service=api().createGeminiWebService(fake.dependencies);
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  await service.status();
  const pending=service.request({messages:[{role:'user',content:'长任务'}]});
  const rejected=assert.rejects(pending,/关闭|断开|停止/);
  await new Promise(resolve=>setTimeout(resolve,10));
  await service.close();
  await rejected;
  assert.equal(fake.launches[0].child.exitCode,0);
});

test('Gemini cancels a queued quota request before the active request finishes', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-gemini-queue-'));
  const fake=fakeBrowser(dir),service=api().createGeminiWebService(fake.dependencies);
  t.after(async()=>{await service.close();fs.rmSync(dir,{recursive:true,force:true});});
  await service.status();
  const events=[],config={messages:[{role:'user',content:'任务'}]};
  const first=service.request(config).then(()=>events.push('first'));
  const controller=new AbortController();
  const second=service.request(config,{signal:controller.signal}).catch(error=>{assert.equal(error.name,'AbortError');events.push('cancelled');});
  controller.abort();
  await Promise.all([first,second]);
  assert.deepEqual(events,['cancelled','first']);
  assert.equal(fake.peak,1);
});

test('Gemini closing during the login transition cannot launch an orphan browser', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-gemini-close-race-'));
  const fake=fakeBrowser(dir,{closeDelay:40}),service=api().createGeminiWebService(fake.dependencies);
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  await service.status();
  const login=service.openLogin();
  const rejected=assert.rejects(login,/停止|关闭/);
  await new Promise(resolve=>setTimeout(resolve,2));
  await service.close();
  await rejected;
  assert.equal(fake.launches.length,1);
  assert.equal(fake.launches[0].child.exitCode,0);
});

test('Gemini preserves received text after a browser transport failure', async t => {
  const completeDir=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-gemini-complete-transport-'));
  const completeFake=fakeBrowser(completeDir,{generateResult:raw=>({ok:false,code:'NETWORK',raw})});
  const completeService=api().createGeminiWebService(completeFake.dependencies);
  t.after(async()=>{await completeService.close();fs.rmSync(completeDir,{recursive:true,force:true});});
  assert.equal(await completeService.request({messages:[{role:'user',content:'任务'}]}),'连接成功');
  const partialDir=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-gemini-partial-transport-'));
  const candidate=Array(9).fill(null);candidate[0]='candidate';candidate[1]=['已收到的正文'];candidate[8]=[1];
  const body=Array(5).fill(null);body[4]=[candidate];
  const partialFake=fakeBrowser(partialDir,{generateResult:()=>({ok:false,code:'NETWORK',raw:frame([['wrb.fr',null,JSON.stringify(body)]])})});
  const partialService=api().createGeminiWebService(partialFake.dependencies);
  t.after(async()=>{await partialService.close();fs.rmSync(partialDir,{recursive:true,force:true});});
  await assert.rejects(partialService.request({messages:[{role:'user',content:'任务'}]}),error=>error.code==='OUTPUT_TRUNCATED'&&error.partialText==='已收到的正文');
});
