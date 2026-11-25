const noFinalText=new Map([
 ['接口已响应，但事件流没有返回正文。','EMPTY_RESPONSE'],
 ['接口已响应，但没有返回模型正文。请核对协议和模型，并使用“测试正文”检查。','EMPTY_RESPONSE'],
 ['模型只返回了推理过程，没有生成最终正文。请检查服务商输出额度或更换模型。','REASONING_ONLY'],
 ['本机 Codex 没有返回正文','EMPTY_RESPONSE'],
 ['Gemini 网页没有返回正文，请检查登录状态和当前模型额度','EMPTY_RESPONSE'],
]);
const fastDeepSeekModel=/(?:^|[/:])deepseek-(?:chat|(?:v\d+(?:\.\d+)*-)?(?:flash|lite|turbo))$/i;

export async function requestVideoDurationText({api,profile,taskId,messages,maxOutputTokens,signal}) {
 signal?.throwIfAborted();
 const cancel=()=>{void Promise.resolve(api.cancelAiTask?.({taskId})).catch(()=>{});};
 signal?.addEventListener('abort',cancel,{once:true});
 try{
  // The chat adapter uses this option for DeepSeek's documented non-thinking mode.
  const nonThinkingEstimate=fastDeepSeekModel.test(profile.model?.trim()||'');
  const result=await api.aiChat({...profile,profileId:profile.id,taskId,messages,maxOutputTokens,stream:true,analysisMode:nonThinkingEstimate,resultEnvelope:true});
  if(result?.ok===false){
   let code=result.code||'REQUEST_FAILED';
   if(!result.httpStatus&&['FAILED','REQUEST_FAILED'].includes(code))code=noFinalText.get(result.error)||code;
   throw Object.assign(new Error(result.error||'估时接口未返回正文'),{code,httpStatus:result.httpStatus});
  }
  return result?.output??result;
 }finally{signal?.removeEventListener('abort',cancel);}
}
