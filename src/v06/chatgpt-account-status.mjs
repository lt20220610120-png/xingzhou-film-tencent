export async function runChatGPTAccountAction(bridge,action,{timeoutMs=50000}={}){
 const method=action==='login'?'chatgptWebOpenLogin':'chatgptWebStatus';
 if(typeof bridge?.[method]!=='function')throw new Error('请在行舟影视桌面应用中连接');
 let timer;
 try{return await Promise.race([
  Promise.resolve().then(()=>bridge[method]()),
  new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('ChatGPT 连接检查超时，登录会话仍保留。请刷新连接，或打开独立窗口检查网络和网站验证。'),{code:'WEB_STATUS_TIMEOUT'})),timeoutMs);}),
 ]);}finally{clearTimeout(timer);}
}
