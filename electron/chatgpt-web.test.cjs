const test=require('node:test'),assert=require('node:assert/strict');
const {createChatGPTWebService,inspectChatGPTResponse}=require('./chatgpt-web.cjs');
const {requestText,testTextConnection}=require('./text-provider.cjs');
function fake({challenge=false,pending=false,loggedIn=true}={}){
 let sent=0,closed=0,logins=0,cancelled=0;
 const browser={loginMessage:'请登录并关闭独立窗口',installed:()=>true,ensure:async()=>{},navigate:async()=>{},command:async()=>{},close:async()=>{closed++;},openLogin:async()=>{logins++;},evaluate:async expression=>{
  if(expression.includes('function inspectChatGPTPage'))return {ready:'complete',origin:'https://chatgpt.com',composer:loggedIn,loggedIn,challenge};
  if(expression.includes('function prepareComposer'))return {ok:true};
  if(expression.includes('function submitComposer')){sent++;return {ok:true};}
  if(expression.includes('function inspectChatGPTResponse'))return {anchored:true,text:'连接成功',streaming:pending,finished:!pending};
  if(expression.includes('stop-button')){cancelled++;return true;}
 }};
 return {browserFactory:()=>browser,get sent(){return sent},get closed(){return closed},get logins(){return logins},get cancelled(){return cancelled}};
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
