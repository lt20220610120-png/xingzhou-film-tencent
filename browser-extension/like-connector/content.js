(()=>{const pending=new Map(),commands=new Set();const identity=crypto.randomUUID();
async function reply(command,value){for(let attempt=0;attempt<3;attempt++){
 try{const result=await chrome.runtime.sendMessage({kind:'command-result',commandId:command.id,jobId:command.jobId,reply:value});if(result?.ok)return;}catch{}
 if(Date.now()>=command.deadline)return;
 await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));
}}
function ask(type,data={},timeout=5000){return new Promise((resolve,reject)=>{const id=crypto.randomUUID();const timer=setTimeout(()=>{pending.delete(id);reject(Error('Like页面尚未就绪，请打开目标画布'));},timeout);pending.set(id,{resolve,reject,timer});window.postMessage({source:'xz-like-isolated',id,type,data},location.origin);});}
window.addEventListener('message',async event=>{if(event.source!==window||event.origin!==location.origin||event.data?.source!=='xz-like-main')return;const message=event.data;
 if(message.type==='response'){const p=pending.get(message.id);if(p){clearTimeout(p.timer);pending.delete(message.id);message.ok?p.resolve(message.result):p.reject(Error(message.error));}}
 if(['asset','authorize'].includes(message.type)&&commands.has(message.commandId)){let result;for(let attempt=0;attempt<2;attempt++){try{result=await chrome.runtime.sendMessage({kind:message.type,commandId:message.commandId,jobId:message.jobId,index:message.index,offset:message.offset});if(result?.ok||message.type==='authorize')break;}catch{}}window.postMessage({source:'xz-like-isolated',type:'asset-reply',id:message.id,result:result||{ok:false,error:'浏览器连接已中断，请先核对原画布'}},location.origin);}
});
chrome.runtime.onMessage.addListener((message,_sender,respond)=>{if(message.kind==='inspect'){ask('inspect').then(result=>respond({...result,id:identity})).catch(e=>respond({id:identity,ready:false,error:e.message}));return true;}
 if(message.kind==='command'){const c=message.command;if(!c?.id)return;commands.add(c.id);respond({received:true});void ask('command',c,Math.max(1000,Math.min(605000,(c.deadline||Date.now()+600000)-Date.now()+1000))).then(result=>reply(c,{ok:true,result}),e=>reply(c,{ok:false,uncertain:true,error:e.message})).finally(()=>commands.delete(c.id));}});
const wake=()=>chrome.runtime.sendMessage({kind:'wake'}).catch(()=>{});setInterval(wake,10000);document.addEventListener('visibilitychange',wake);window.addEventListener('pageshow',wake);wake();
})();
