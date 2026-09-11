const test = require('node:test');
const assert = require('node:assert/strict');
const { parseResponse, requestChat, resolveProtocol } = require('./ai-service.cjs');
const config = {endpoint:'https://example.test/v1',model:'demo',apiKey:'test',messages:[{role:'user',content:'hello'}]};
const response = data => ({ok:true,status:200,text:async()=>JSON.stringify(data)});
test('Responses traverses output items and ignores reasoning before the final message',()=>{
 assert.equal(parseResponse(JSON.stringify({status:'completed',output:[{type:'reasoning',summary:[{text:'private'}]},{type:'message',content:[{type:'output_text',text:'最终'},{type:'output_text',text:'正文'}]}]})),'最终正文');
});
test('Chat SSE assembles deltas and requires a completion marker',()=>{
 const stream='data: '+JSON.stringify({choices:[{delta:{content:'正文'}}]})+'\n\n';
 assert.equal(parseResponse(stream+'data: [DONE]\n\n'),'正文');
 assert.throws(()=>parseResponse(stream),/传输中断/);
});
test('Responses SSE uses the final snapshot without duplicating deltas',()=>{
 const events=[{type:'response.output_text.delta',delta:'正文'},{type:'response.completed',response:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'正文'}]}]}}];
 assert.equal(parseResponse(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')),'正文');
});
test('empty, reasoning-only, failed and truncated results cannot masquerade as successful generation',()=>{
 for(const data of [{choices:[{message:{content:'',reasoning_content:'thinking'}}]},{error:{message:'upstream failed'}},{choices:[{message:{content:'partial'},finish_reason:'length'}]},{status:'incomplete',output_text:'partial'},{}]) assert.throws(()=>parseResponse(JSON.stringify(data)));
});
test('Responses request uses input and respects the explicitly chosen protocol',async()=>{
 let captured;
 const result=await requestChat({...config,protocol:'responses'},{fetchFn:async(url,options)=>{captured={url,body:JSON.parse(options.body)};return response({output:[{type:'message',content:[{type:'output_text',text:'ok'}]}]})}});
 assert.equal(result,'ok');assert.equal(captured.url,'https://example.test/v1/responses');assert.deepEqual(captured.body.input,config.messages);assert.equal(captured.body.messages,undefined);
});
test('chat request omits model-specific temperature and never retries a billable empty result',async()=>{
 let count=0;await assert.rejects(()=>requestChat(config,{fetchFn:async(url,options)=>{count++;assert.equal(JSON.parse(options.body).temperature,undefined);return response({choices:[{message:{content:''}}]})}}));assert.equal(count,1);
});
test('timeout still applies when the caller supplies a cancellation signal',async()=>{
 const external=new AbortController();const fetchFn=async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)));
 await assert.rejects(()=>requestChat({...config,signal:external.signal,timeout:20},{fetchFn}),/超时/);assert.equal(external.signal.aborted,false);
});
test('explicit Anthropic requests separate system messages and use x-api-key',async()=>{
 let captured;await requestChat({...config,protocol:'anthropic',messages:[{role:'system',content:'system'},...config.messages]},{fetchFn:async(url,options)=>{captured={url,options,body:JSON.parse(options.body)};return response({content:[{type:'text',text:'ok'}]})}});
 assert.equal(captured.url,'https://example.test/v1/messages');assert.equal(captured.body.system,'system');assert.equal(captured.body.messages.length,1);assert.equal(captured.options.headers['x-api-key'],'test');assert.equal(captured.options.headers.Authorization,undefined);
});
test('protocol auto detection preserves existing chat endpoints',()=>{
 assert.equal(resolveProtocol(config),'chat');assert.equal(resolveProtocol({...config,endpoint:config.endpoint+'/responses'}),'responses');
});
test('functional episode edits preserve concurrent scene drafts and empty text through persistence',async()=>{
 const {updateDirectorEpisode,normalizeState}=await import('../core/projectStore.js');
 let state={directorProjects:[{id:'p',episodes:[{id:'e',quickSceneEdits:{a:'old'}}]}]};
 const save=(scene,text)=>state=updateDirectorEpisode(state,'p','e',ep=>({quickSceneEdits:{...ep.quickSceneEdits,[scene]:text}}));
 save('a','');save('b','第二场');
 const reloaded=normalizeState(JSON.parse(JSON.stringify(state)));
 assert.deepEqual(reloaded.directorProjects[0].episodes[0].quickSceneEdits,{a:'',b:'第二场'});
});
