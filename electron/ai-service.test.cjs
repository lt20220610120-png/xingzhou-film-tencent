const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeEndpoint,chatCompletionsUrl,testAiConnection}=require('./ai-service.cjs');

test('OpenAI 兼容接口地址自动清理并避免重复 v1',()=>{
 assert.equal(normalizeEndpoint('https://maxforai.top/v1/'),'https://maxforai.top/v1');
 assert.equal(chatCompletionsUrl('https://maxforai.top/v1/chat/completions'),'https://maxforai.top/v1/chat/completions');
 assert.equal(chatCompletionsUrl('https://maxforai.top/v1'),'https://maxforai.top/v1/chat/completions');
});

test('保存前通过真实聊天请求验证接口并返回模型回复',async()=>{
 let request;
 const fetchFn=async(url,options)=>{request={url,options};return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:'连接成功'}}]})}};
 const result=await testAiConnection({endpoint:'https://maxforai.top/v1',apiKey:'secret',model:'gpt-5.6-sol'},{fetchFn});
 assert.equal(result.message,'连接成功');
 assert.equal(request.url,'https://maxforai.top/v1/chat/completions');
 assert.equal(JSON.parse(request.options.body).model,'gpt-5.6-sol');
 assert.equal(request.options.headers.Authorization,'Bearer secret');
});

test('无需API Key的本地OpenAI兼容服务可连接且不发送Authorization',async()=>{
 let options;
 const fetchFn=async(_url,input)=>{options=input;return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:'连接成功'}}]})}};
 await testAiConnection({endpoint:'http://localhost:11434/v1',apiKey:'',model:'qwen3',requiresApiKey:false},{fetchFn});
 assert.equal(options.headers.Authorization,undefined);
});

test('接口错误返回服务端可读原因而不是假装保存成功',async()=>{
 const fetchFn=async()=>({ok:false,status:401,text:async()=>JSON.stringify({error:{message:'Invalid API key'}})});
 await assert.rejects(()=>testAiConnection({endpoint:'https://maxforai.top/v1',apiKey:'bad',model:'gpt-5.6-sol'},{fetchFn}),/Invalid API key/);
});
