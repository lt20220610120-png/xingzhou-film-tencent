const BASE='http://127.0.0.1:18764';let busy=false;const activeAssets=new Map();
chrome.storage.local.setAccessLevel?.({accessLevel:'TRUSTED_CONTEXTS'});
async function call(path,body,token){const r=await fetch(BASE+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});const value=await r.json();if(!r.ok)throw Error(value.error||'本机连接失败');return value;}
async function paired(){return (await chrome.storage.local.get('token')).token;}
async function poll(){if(busy)return;busy=true;try{const token=await paired();if(!token)return;const tabs=await chrome.tabs.query({url:'https://likeai.pro/projects/*'}),pages=[];
 for(const tab of tabs)try{const page=await chrome.tabs.sendMessage(tab.id,{kind:'inspect'});if(page)pages.push({...page,url:page.url||tab.url,tabId:tab.id});}catch{}
 const response=await call('/poll',{pages},token);await chrome.storage.local.set({lastConnected:Date.now(),lastError:''});
 for(const command of response.commands||[]){const page=pages.find(p=>p.id===command.pageId);if(!page)continue;const claimed=(await chrome.storage.local.get('claimed')).claimed||{};const duplicate=command.op==='submitVideo'&&claimed[command.jobId];if(command.op==='submitVideo'){claimed[command.jobId]=Date.now();const entries=Object.entries(claimed).sort((a,b)=>b[1]-a[1]).slice(0,2000);await chrome.storage.local.set({claimed:Object.fromEntries(entries)});}const actual=duplicate?{...command,op:'taskStatus'}:command;
 if(actual.op==='submitVideo')activeAssets.set(command.id,{jobId:command.jobId,count:command.references.length,tabId:page.tabId,at:Date.now()});
 void chrome.tabs.sendMessage(page.tabId,{kind:'command',command:actual}).then(async reply=>{await call('/reply',{id:command.id,...reply},token);}).catch(async()=>{try{await call('/reply',{id:command.id,ok:false,uncertain:true,error:'网页连接中断，请先核对原画布；不会自动重新生成'},token);}catch{}}).finally(()=>activeAssets.delete(command.id));
 }
}catch(e){await chrome.storage.local.set({lastError:String(e.message||e).slice(0,200)});}finally{busy=false;}}
chrome.alarms.create('like-reconnect',{periodInMinutes:0.5});chrome.alarms.onAlarm.addListener(()=>poll());chrome.runtime.onStartup.addListener(()=>poll());chrome.runtime.onInstalled.addListener(()=>poll());
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 (async()=>{
  const internal=sender.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('popup.html');
  if(message.kind==='pair'&&internal){const result=await call('/pair',{code:String(message.code||'').trim()});await chrome.storage.local.set({token:result.token,claimed:{},lastError:''});void poll();return {ok:true};}
  if(message.kind==='status'&&internal){const s=await chrome.storage.local.get(['token','lastConnected','lastError']);return {paired:!!s.token,lastConnected:s.lastConnected,error:s.lastError};}
  if(message.kind==='wake'&&sender.tab&&/^https:\/\/likeai\.pro\/projects\/[a-f0-9]{24}$/.test(sender.url||'')){void poll();return {ok:true};}
  if(message.kind==='authorize'&&sender.tab){const claim=activeAssets.get(message.commandId);if(!claim||claim.tabId!==sender.tab.id||message.jobId!==claim.jobId)throw Error('本次生成没有授权');return await call('/authorize',{id:message.commandId,jobId:message.jobId},await paired());}
  if(message.kind==='asset'&&sender.tab){const claim=activeAssets.get(message.commandId);if(!claim||claim.tabId!==sender.tab.id||claim.at<Date.now()-1800000||message.jobId!==claim.jobId||!Number.isInteger(message.index)||message.index<0||message.index>=claim.count)throw Error('没有这项选中素材的读取授权');const offset=Number(message.offset);if(!Number.isSafeInteger(offset)||offset<0)throw Error('素材读取位置无效');const token=await paired(),r=await fetch(BASE+'/asset?jobId='+encodeURIComponent(claim.jobId)+'&index='+message.index+'&offset='+offset,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('本次选中素材读取失败');const bytes=new Uint8Array(await r.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return {data:btoa(binary),total:Number(r.headers.get('X-Total-Length')),mime:r.headers.get('Content-Type')};}
  throw Error('不支持的连接操作');
 })().then(v=>respond({ok:true,...v})).catch(e=>respond({ok:false,error:String(e.message||e)}));return true;
});
