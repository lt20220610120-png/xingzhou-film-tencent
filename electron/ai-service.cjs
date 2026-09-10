function normalizeEndpoint(endpoint=''){
 return endpoint.trim().replace(/\/+$/,'').replace(/\/chat\/completions$/,'');
}
function chatCompletionsUrl(endpoint){return `${normalizeEndpoint(endpoint)}/chat/completions`}
function textContent(value){
 if(typeof value==='string')return value;
 if(Array.isArray(value))return value.map(item=>typeof item==='string'?item:(item?.text||item?.content||'')).join('');
 return value?.text||value?.content||'';
}
async function requestChat({endpoint,apiKey='',model,messages,requiresApiKey=true,timeout:requestTimeout,signal},{fetchFn=fetch,timeout=defaultTimeout=30000}={}){
 if(!endpoint?.trim())throw new Error('请填写接口地址');
 if(!model?.trim())throw new Error('请填写模型名称');
 if(requiresApiKey!==false&&!apiKey?.trim())throw new Error('请填写 API Key');
 const headers={'Content-Type':'application/json'};
 if(apiKey?.trim())headers.Authorization=`Bearer ${apiKey.trim()}`;
 const timeoutMs=Number(requestTimeout)||defaultTimeout;
 const response=await fetchFn(chatCompletionsUrl(endpoint),{method:'POST',headers,body:JSON.stringify({model:model.trim(),messages,temperature:.2}),signal:signal||AbortSignal.timeout(timeoutMs)});
 const text=await response.text();let data;
 try{data=JSON.parse(text)}catch{throw new Error(`接口返回异常：${text.slice(0,160)||'空响应'}`)}
 if(!response.ok)throw new Error(data?.error?.message||`接口请求失败（${response.status}）`);
 const choice=data?.choices?.[0]||{};
 const content=textContent(choice?.message?.content)||textContent(choice?.message?.reasoning_content)||textContent(choice?.text)||textContent(data?.output_text);
 if(!content)throw new Error('接口已响应，但没有返回模型内容');
 return content;
}
async function testAiConnection(config,options){
 const message=await requestChat({...config,messages:[{role:'user',content:'只回复：连接成功'}]},options);
 return {ok:true,message};
}
module.exports={normalizeEndpoint,chatCompletionsUrl,textContent,requestChat,testAiConnection};
