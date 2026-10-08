const test=require('node:test'),assert=require('node:assert/strict');
const {createChatGPTWebService,inspectChatGPTPage,inspectChatGPTResponse,submitComposer}=require('./chatgpt-web.cjs');
const {requestText,testTextConnection}=require('./text-provider.cjs');
function fake({challenge=false,pending=false,loggedIn=true}={}){
 let sent=0,closed=0,logins=0,cancelled=0;
 const browser={loginMessage:'请登录并关闭独立窗口',installed:()=>true,ensure:async()=>{},navigate:async()=>{},command:async()=>{},close:async()=>{closed++;},openLogin:async()=>{logins++;},evaluate:async expression=>{
  if(expression.includes('function inspectChatGPTResponse'))return {anchored:true,text:'连接成功',streaming:pending,finished:!pending};
  if(expression.includes('function inspectChatGPTPage'))return {ready:'complete',origin:'https://chatgpt.com',composer:loggedIn,loggedIn,challenge};
  if(expression.includes('function prepareComposer'))return {ok:true};
  if(expression.includes('function submitComposer')){sent++;return {ok:true};}
  if(expression.includes('stop-button')){cancelled++;return true;}
 }};
 return {browserFactory:()=>browser,verificationWaitMs:0,get sent(){return sent},get closed(){return closed},get logins(){return logins},get cancelled(){return cancelled}};
}
test('ChatGPT website provider returns a finished anchored answer and never invokes Codex or a paid API',async()=>{
 const state=fake(),service=createChatGPTWebService(state);let fallback=0;
 const result=await testTextConnection({provider:'chatgptWeb',model:'auto'},{chatgptRun:(c,o)=>service.request(c,o),apiTest:()=>fallback++,codexRun:()=>fallback++});
 assert.equal(result.message,'连接成功');assert.equal(result.protocol,'chatgptWeb');assert.equal(fallback,0);assert.equal(state.sent,1);assert.equal(state.logins,0);await service.close();assert.equal(state.closed,1);
});
test('ChatGPT login status does not bypass a website verification challenge',async()=>{
 const state=fake({challenge:true}),service=createChatGPTWebService(state);
 const status=await service.status();assert.equal(status.loggedIn,false);assert.equal(status.code,'WEB_VERIFICATION_REQUIRED');
 await assert.rejects(service.request({model:'auto',messages:[{role:'user',content:'Hello'}]}),/人工验证/);assert.equal(state.sent,0);assert.equal(state.logins,0);
 await service.openLogin();assert.equal(state.logins,1);await service.close();
});
test('ChatGPT stops the owned response on cancellation and cancels queued work before submission',async()=>{
 const state=fake({pending:true}),service=createChatGPTWebService(state),controller=new AbortController(),second=new AbortController(),config={model:'auto',messages:[{role:'user',content:'Hello'}]};
 const first=service.request(config,{signal:controller.signal}),rejection=assert.rejects(first,e=>e.name==='AbortError');
 const queued=service.request(config,{signal:second.signal}),queuedRejection=assert.rejects(queued,e=>e.name==='AbortError');second.abort();
 await new Promise(r=>setTimeout(r,650));controller.abort();await Promise.all([rejection,queuedRejection]);await new Promise(r=>setTimeout(r,500));assert.equal(state.sent,1);assert.ok(state.cancelled>=1);await service.close();
});
test('website routing fails closed when the local service was not initialized',async()=>{
 let fallback=0;await assert.rejects(requestText({provider:'chatgptWeb',model:'auto'},{apiRun:()=>fallback++,codexRun:()=>fallback++}),/尚未初始化/);assert.equal(fallback,0);
});
test('DOM response extraction ignores older assistant turns and removes the website JSON widget toolbar',t=>{
 const originalDocument=global.document,originalNode=global.Node;t.after(()=>{global.document=originalDocument;global.Node=originalNode;});
 const old={},fresh={querySelector:()=>({innerText:'json\n复制代码\n{"episodes":[]}',querySelectorAll:()=>[{textContent:'{"episodes":[]}'}]}),closest:()=>({querySelector:()=>({})})};
 const user={textContent:'XZ_REQUEST_unique',closest:()=>({}),compareDocumentPosition:e=>e===fresh?4:2};
 global.Node={DOCUMENT_POSITION_FOLLOWING:4};global.document={querySelectorAll:selector=>selector.includes('"user"')?[user]:selector.includes('"assistant"')?[old,fresh]:[]};
 const result=inspectChatGPTResponse('XZ_REQUEST_unique');assert.equal(result.text,'{"episodes":[]}');assert.equal(result.finished,true);assert.equal(result.streaming,false);assert.equal(result.anchored,true);
});
test('Chinese browser verification is distinct from a logged-out account',t=>{
 const previousDocument=global.document,previousLocation=global.location;t.after(()=>{global.document=previousDocument;global.location=previousLocation;});
 global.location={origin:'https://chatgpt.com'};global.document={title:'请稍候…',readyState:'complete',querySelectorAll:()=>[],querySelector:()=>null};
 const state=inspectChatGPTPage();assert.equal(state.challenge,true);assert.equal(state.loggedOut,false);assert.equal(state.loggedIn,false);
});
test('account detection waits for ChatGPT hydration after readyState complete without reopening login',async()=>{
 const state=fake(),browser=state.browserFactory();let checks=0,evaluate=browser.evaluate;
 browser.evaluate=async expression=>expression.includes('function inspectChatGPTPage')&&checks++===0?{ready:'complete',composer:false,loggedIn:false,loggedOut:false}:evaluate(expression);
 const service=createChatGPTWebService({...state,browserFactory:()=>browser});const result=await service.status();assert.equal(result.loggedIn,true);assert.ok(checks>=2);assert.equal(state.logins,0);await service.close();
});
test('ProseMirror input readback preserves the inserted blank paragraph rather than layout innerText spacing',t=>{
 const previousDocument=global.document;t.after(()=>{global.document=previousDocument;});
 const text=value=>({nodeType:3,textContent:value}),paragraph=value=>({tagName:'P',textContent:value,childNodes:value?[text(value)]:[{tagName:'BR',nodeType:1,childNodes:[]}]}),send={disabled:false,dataset:{testid:'send-button'},getClientRects:()=>[{}],click(){this.clicked=true;}};
 const editor={tagName:'DIV',children:[paragraph('Header'),paragraph(''),paragraph('{"message":"hello"}')],innerText:'Header\n\n\n{"message":"hello"}',getClientRects:()=>[{}],closest:()=>({})};
 global.document={querySelectorAll:selector=>selector.includes('#prompt-textarea')?[editor]:[send]};
 assert.equal(submitComposer('Header\n\n{"message":"hello"}').ok,true);assert.equal(send.clicked,true);send.clicked=false;assert.equal(submitComposer('Header\n\n{"message":"different"}').reason,'COMPOSER_MISMATCH');assert.equal(send.clicked,false);
});
test('a page that never finishes account hydration is reported as loading failure rather than logged out',async()=>{
 const state=fake(),browser=state.browserFactory();browser.evaluate=async()=>({ready:'complete',composer:false,loggedIn:false,loggedOut:false});
 const service=createChatGPTWebService({...state,browserFactory:()=>browser,inspectTimeoutMs:1});const result=await service.status();assert.equal(result.code,'WEB_PAGE_NOT_READY');assert.match(result.message,/加载/);assert.doesNotMatch(result.message,/请.*登录/);assert.equal(state.logins,0);await service.close();
});

test('status has an overall deadline including browser startup and can be refreshed after timeout', {timeout:2000},async()=>{
 const state=fake(),browser=state.browserFactory();let attempts=0;
 browser.ensure=signal=>++attempts===1?new Promise((resolve,reject)=>signal?.addEventListener('abort',()=>reject(Object.assign(new Error('stopped'),{name:'AbortError'})),{once:true})):Promise.resolve();
 const service=createChatGPTWebService({...state,browserFactory:()=>browser,statusTimeoutMs:30});
 const result=await Promise.race([service.status(),new Promise(r=>setTimeout(()=>r({code:'HUNG'}),200))]);assert.equal(result.code,'WEB_STATUS_TIMEOUT');assert.equal(result.authState,'unknown');
 assert.equal((await service.status()).loggedIn,true);await service.close();
});

test('status does not wait behind a generating request or touch its page', {timeout:3000},async()=>{
 const state=fake({pending:true}),browser=state.browserFactory();let inspectCalls=0;
 const evaluate=browser.evaluate;browser.evaluate=async expression=>{if(expression.includes('function inspectChatGPTPage'))inspectCalls++;return evaluate(expression);};
 const service=createChatGPTWebService({...state,browserFactory:()=>browser}),controller=new AbortController();
 const request=service.request({model:'auto',messages:[{role:'user',content:'Hello'}]},{signal:controller.signal}),rejection=assert.rejects(request,e=>e.name==='AbortError');
 await new Promise(r=>setTimeout(r,20));const before=inspectCalls;
 try{const status=await Promise.race([service.status(),new Promise(r=>setTimeout(()=>r({code:'HUNG'}),100))]);assert.equal(status.code,'WEB_BUSY');assert.equal(status.running,true);assert.equal(inspectCalls,before);}finally{controller.abort();await rejection;await service.close();}
});

test('simultaneous status refreshes share one bounded account inspection',async()=>{
 const state=fake(),browser=state.browserFactory();let checks=0;
 const evaluate=browser.evaluate;browser.evaluate=async expression=>{if(expression.includes('function inspectChatGPTPage'))checks++;return evaluate(expression);};
 const service=createChatGPTWebService({...state,browserFactory:()=>browser});
 const results=await Promise.all([service.status(),service.status(),service.status()]);assert.ok(results.every(s=>s.loggedIn));assert.equal(checks,1);await service.close();
});

test('network error pages are distinct from expired login and website verification',async()=>{
 const state=fake(),browser=state.browserFactory();browser.evaluate=async()=>({ready:'complete',networkError:true,loggedIn:false,loggedOut:false,challenge:false});
 const service=createChatGPTWebService({...state,browserFactory:()=>browser,inspectTimeoutMs:1000});const result=await service.status();assert.equal(result.code,'WEB_NETWORK_ERROR');assert.equal(result.authState,'unknown');await service.close();
});

test('explicit logged-out detection reports a login-required category',async()=>{
 const state=fake(),browser=state.browserFactory();browser.evaluate=async()=>({ready:'complete',loggedIn:false,loggedOut:true,challenge:false});
 const service=createChatGPTWebService({...state,browserFactory:()=>browser});const result=await service.status();assert.equal(result.code,'WEB_LOGIN_REQUIRED');assert.equal(result.authState,'required');await service.close();
});

test('opening login while a text request is running returns busy without disrupting it', {timeout:3000},async()=>{
 const state=fake({pending:true}),service=createChatGPTWebService(state),controller=new AbortController();
 const request=service.request({model:'auto',messages:[{role:'user',content:'Hello'}]},{signal:controller.signal}),rejection=assert.rejects(request,e=>e.name==='AbortError');
 await new Promise(r=>setTimeout(r,20));
 try{const result=await Promise.race([service.openLogin(),new Promise(r=>setTimeout(()=>r({code:'HUNG'}),100))]);assert.equal(result.code,'WEB_BUSY');assert.equal(state.logins,0);}finally{controller.abort();await rejection;await service.close();}
});

test('an expired login stops a text request with the login-required category',async()=>{
 const state=fake(),browser=state.browserFactory();browser.evaluate=async()=>({ready:'complete',loggedIn:false,loggedOut:true,challenge:false});
 const service=createChatGPTWebService({...state,browserFactory:()=>browser});await assert.rejects(service.request({model:'auto',messages:[{role:'user',content:'Hello'}]}),e=>e.code==='WEB_LOGIN_REQUIRED');await service.close();
});

test('a verification page replacing a sent response reports verification rather than waiting for generation timeout',async()=>{
 const state=fake(),browser=state.browserFactory(),evaluate=browser.evaluate;
 browser.evaluate=async expression=>expression.includes('function inspectChatGPTResponse')?{anchored:false,text:'',streaming:false,finished:false,challenge:true}:evaluate(expression);
 const service=createChatGPTWebService({...state,browserFactory:()=>browser});await assert.rejects(service.request({model:'auto',messages:[{role:'user',content:'Hello'}],timeout:1000}),e=>e.code==='WEB_VERIFICATION_REQUIRED');await service.close();
});


test('a new conversation uses the website control without programmatic navigation',async()=>{
 const state=fake(),browser=state.browserFactory();let hasMessages=true,navigations=0,newChats=0;const evaluate=browser.evaluate;
 browser.navigate=async()=>{navigations++;};
 browser.evaluate=async expression=>{if(expression.includes('function startNewChat')){newChats++;hasMessages=false;return {ok:true};}if(expression.includes('function inspectChatGPTPage')&&!expression.includes('inspectChatGPTResponse'))return {ready:'complete',loggedIn:true,hasMessages};return evaluate(expression);};
 const service=createChatGPTWebService({...state,browserFactory:()=>browser});assert.equal(await service.request({model:'auto',messages:[{role:'user',content:'新任务'}]}),'连接成功');
 assert.equal(navigations,0);assert.equal(newChats,1);await service.close();
});
