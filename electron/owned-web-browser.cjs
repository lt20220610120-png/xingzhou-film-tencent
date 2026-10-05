const fs=require('node:fs'),path=require('node:path');
const {spawn:nativeSpawn}=require('node:child_process');
const {findBrowser,createCdpConnection}=require('./gemini-web.cjs');
const {spawnBackgroundBrowser}=require('./windows-background-browser.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const abortError=()=>Object.assign(new Error('任务已停止'),{name:'AbortError'});
const check=signal=>{if(signal?.aborted)throw abortError();};
function createOwnedWebBrowser({profileDir,url,name,findBrowser:locate=findBrowser,spawn=nativeSpawn,WebSocket=global.WebSocket,startupTimeoutMs=30000}={}){
 if(!profileDir||!url||!name)throw new Error('独立浏览器配置缺失');
 const profile=path.resolve(profileDir);
 if(/[/\\](?:Microsoft[/\\]Edge|Google[/\\]Chrome)[/\\]User Data(?:[/\\]|$)/i.test(profile))throw new Error('必须使用行舟影视独立浏览器资料目录');
 let connection,session,child,visible=false,closed=false;
 const loginMessage=`请打开 ${name} 独立登录窗口，完成登录后关闭该窗口，再刷新连接`;
 async function closeBrowser(){
  const own=connection;connection=null;session=null;
  if(own){try{await own.command('Browser.close',{},null,{timeout:5000});}catch{}own.disconnect();}
  const process=child;child=null;visible=false;
  if(process&&process.exitCode==null){await Promise.race([new Promise(r=>process.once('exit',r)),pause(1000)]);if(process.exitCode==null){process.kill();await Promise.race([new Promise(r=>process.once('exit',r)),pause(5000)]);if(process.exitCode==null)throw new Error(`${name} 后台浏览器仍在退出，请稍后刷新连接`);}}
 }
 async function ensure(signal){
  check(signal);if(closed)throw new Error(`${name} 服务已停止`);
  if(visible&&child?.exitCode==null)throw new Error(loginMessage);
  if(connection?.socket.readyState===1)return;
  if(child||connection)await closeBrowser();
  const executable=locate();if(!executable)throw new Error('本机未找到 Edge 或 Chrome');
  fs.mkdirSync(profile,{recursive:true});const portFile=path.join(profile,'DevToolsActivePort');
  try{fs.unlinkSync(portFile);}catch{}
  try{
  child=spawnBackgroundBrowser(executable,[`--user-data-dir=${profile}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check','--disable-background-mode','--disable-background-timer-throttling',url],{spawn});
  let failed=false;child.once('error',()=>{failed=true;});
  const deadline=Date.now()+startupTimeoutMs;
  while(Date.now()<deadline){
   check(signal);if(closed)throw new Error(`${name} 服务已停止`);
   if(failed||child?.exitCode!=null){const cause=/XINGZHOU_BACKGROUND_ERROR:([^\r\n<]+)/.exec(child?.startupError||'')?.[1];throw new Error(cause?`${name} 后台浏览器启动失败（${cause}）`:`${name} 独立浏览器启动失败，请关闭独立登录窗口后重试`);}
   let lines;try{lines=fs.readFileSync(portFile,'utf8').trim().split(/\r?\n/);}catch{await pause(150);continue;}
   if(!/^\d+$/.test(lines[0])||!/^\/devtools\/browser\/[a-z0-9-]+$/i.test(lines[1]||'')){await pause(150);continue;}
   connection=createCdpConnection(`ws://127.0.0.1:${Number(lines[0])}${lines[1]}`,WebSocket);await connection.opened;
   const targets=await connection.command('Target.getTargets');
   const target=targets.targetInfos.find(x=>x.type==='page'&&x.url?.startsWith(new URL(url).origin+'/'))||targets.targetInfos.find(x=>x.type==='page');
   const targetId=target?.targetId||(await connection.command('Target.createTarget',{url})).targetId;
   session=(await connection.command('Target.attachToTarget',{targetId,flatten:true})).sessionId;return;
  }
  throw new Error(`${name} 后台浏览器启动超时`);
  }catch(error){
   // A failed initial connection must release the owned browser/profile now,
   // so a later refresh or explicit login does not inherit a stale lock.
   try{await closeBrowser();}catch(cleanupError){error.message+=`；${cleanupError.message}`;}
   throw error;
  }
 }
 async function evaluate(expression,{signal,timeout=30000}={}){
  check(signal);const r=await connection.command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session,{signal,timeout});
  if(r.exceptionDetails)throw new Error(`${name} 网页执行失败，请重新检查连接`);return r.result?.value;
 }
 return {loginMessage,installed:()=>!!locate(),ensure,evaluate,
  command:(method,params={},options={})=>connection.command(method,params,session,options),
  navigate:async(target=url,signal)=>{
   await ensure(signal);const origin=await evaluate('performance.timeOrigin',{signal});await connection.command('Page.navigate',{url:target},session,{signal});
   const deadline=Date.now()+30000;
   while(Date.now()<deadline){const page=await evaluate('({origin:performance.timeOrigin,ready:document.readyState})',{signal});if(page.origin!==origin&&page.ready==='complete')return;await pause(200);check(signal);}
   throw new Error(`${name} 网页加载超时，请检查网络`);
  },
  openLogin:async()=>{
   if(visible&&child?.exitCode==null)return;
   await closeBrowser();if(closed)throw new Error(`${name} 服务已停止`);
   const executable=locate();if(!executable)throw new Error('本机未找到 Edge 或 Chrome');fs.mkdirSync(profile,{recursive:true});
   const own=spawn(executable,[`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-mode',url],{windowsHide:false,shell:false,stdio:'ignore'});child=own;visible=true;
   own.once('exit',()=>{if(child===own){child=null;visible=false;}});own.once('error',()=>{if(child===own){child=null;visible=false;}});
  },
  close:()=>{closed=true;return closeBrowser();}
 };
}
module.exports={createOwnedWebBrowser,abortError,pause};
