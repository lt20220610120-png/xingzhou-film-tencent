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
 let connection,session,targetId,child,visible=false,closed=false;
 const loginMessage=`请在 ${name} 独立窗口完成登录或网站验证，保留该窗口并刷新连接；连接成功后窗口会最小化供后台调用`;
 const command=async(method,params={},pageSession,options={})=>{try{return await connection.command(method,params,pageSession,options);}catch(error){error.message=error.message.replace(/Gemini/g,name);throw error;}};
 async function attach(signal,deadline){
  const portFile=path.join(profile,'DevToolsActivePort');
  while(Date.now()<deadline){
   check(signal);if(closed)throw new Error(`${name} 服务已停止`);
   if(child?.launchFailed||child?.exitCode!=null){const cause=/XINGZHOU_BACKGROUND_ERROR:([^\r\n<]+)/.exec(child?.startupError||'')?.[1];throw Object.assign(new Error(cause?`${name} 后台浏览器启动失败（${cause}）`:`${name} 独立浏览器已退出，请重新打开登录窗口`),{code:'WEB_BROWSER_UNAVAILABLE'});}
   let lines;try{lines=fs.readFileSync(portFile,'utf8').trim().split(/\r?\n/);}catch{await pause(150);continue;}
   if(!/^\d+$/.test(lines[0])||!/^\/devtools\/browser\/[a-z0-9-]+$/i.test(lines[1]||'')){await pause(150);continue;}
   connection=createCdpConnection(`ws://127.0.0.1:${Number(lines[0])}${lines[1]}`,WebSocket);
   // Account checks may expire while the socket is still opening. Disconnect
   // immediately instead of leaving the queue and owned profile locked.
   await new Promise((resolve,reject)=>{const abort=()=>{connection?.disconnect();reject(abortError());};signal?.addEventListener('abort',abort,{once:true});connection.opened.then(resolve,reject).finally(()=>signal?.removeEventListener('abort',abort));if(signal?.aborted)abort();});
   check(signal);const opts={signal,timeout:Math.max(1,deadline-Date.now())};
   const targets=await command('Target.getTargets',{},null,opts);
   const target=targets.targetInfos.find(x=>x.type==='page'&&x.url?.startsWith(new URL(url).origin+'/'))||targets.targetInfos.find(x=>x.type==='page');
   targetId=target?.targetId||(await command('Target.createTarget',{url},null,opts)).targetId;
   session=(await command('Target.attachToTarget',{targetId,flatten:true},null,opts)).sessionId;return;
  }
  throw Object.assign(new Error(`${name} 后台浏览器启动超时，请稍后刷新连接`),{code:'WEB_BROWSER_UNAVAILABLE'});
 }
 async function closeBrowser(){
  const own=connection;connection=null;session=null;targetId=null;
  if(own){try{await own.command('Browser.close',{},null,{timeout:5000});}catch{}own.disconnect();}
  const process=child;child=null;visible=false;
  if(process&&process.exitCode==null){await Promise.race([new Promise(r=>process.once('exit',r)),pause(1000)]);if(process.exitCode==null){process.kill();if(process.exitCode==null)await Promise.race([new Promise(r=>process.once('exit',r)),pause(5000)]);if(process.exitCode==null)throw new Error(`${name} 后台浏览器仍在退出，请稍后刷新连接`);}}
 }
 async function ensure(signal){
  check(signal);if(closed)throw new Error(`${name} 服务已停止`);
  if(connection?.socket.readyState===1&&session&&targetId)return;
  if(child&&child.exitCode==null){
   const stale=connection;connection=null;session=null;targetId=null;stale?.disconnect();
   try{await attach(signal,Date.now()+startupTimeoutMs);}catch(error){
    // An open socket alone is not an attached page. Discard failed transport
    // so the next check can reconnect, while keeping the login window open.
    const failed=connection;connection=null;session=null;targetId=null;failed?.disconnect();throw error;
   }
   return;
  }
  if(child||connection)await closeBrowser();
  const executable=locate();if(!executable)throw new Error('本机未找到 Edge 或 Chrome');
  fs.mkdirSync(profile,{recursive:true});const portFile=path.join(profile,'DevToolsActivePort');
  try{fs.unlinkSync(portFile);}catch{}
  try{
  child=spawnBackgroundBrowser(executable,[`--user-data-dir=${profile}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check','--disable-background-mode','--disable-background-timer-throttling',url],{spawn});
  const launched=child;launched.once('error',()=>{launched.launchFailed=true;});
  await attach(signal,Date.now()+startupTimeoutMs);
  }catch(error){
   // A failed initial connection must release the owned browser/profile now,
   // so a later refresh or explicit login does not inherit a stale lock.
   try{await closeBrowser();}catch(cleanupError){error.message+=`；${cleanupError.message}`;}
   throw error;
  }
 }
 async function evaluate(expression,{signal,timeout=30000}={}){
  check(signal);const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session,{signal,timeout});
  if(r.exceptionDetails)throw new Error(`${name} 网页执行失败，请重新检查连接`);return r.result?.value;
 }
 return {loginMessage,installed:()=>!!locate(),ensure,evaluate,
  command:(method,params={},options={})=>command(method,params,session,options),
  navigate:async(target=url,signal)=>{
   await ensure(signal);const origin=await evaluate('performance.timeOrigin',{signal});await command('Page.navigate',{url:target},session,{signal});
   const deadline=Date.now()+30000;
   while(Date.now()<deadline){const page=await evaluate('({origin:performance.timeOrigin,ready:document.readyState})',{signal});if(page.origin!==origin&&page.ready==='complete')return;await pause(200);check(signal);}
   throw new Error(`${name} 网页加载超时，请检查网络`);
  },
  openLogin:async()=>{
   if(child&&child.exitCode==null){await ensure();visible=true;const {windowId}=await command('Browser.getWindowForTarget',{targetId},null,{timeout:5000});await command('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}},null,{timeout:5000});await command('Page.bringToFront',{},session,{timeout:5000});return;}
   await closeBrowser();if(closed)throw new Error(`${name} 服务已停止`);
   const executable=locate();if(!executable)throw new Error('本机未找到 Edge 或 Chrome');fs.mkdirSync(profile,{recursive:true});
   try{fs.unlinkSync(path.join(profile,'DevToolsActivePort'));}catch{}
   const own=spawn(executable,[`--user-data-dir=${profile}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check','--disable-background-mode','--disable-background-timer-throttling',url],{windowsHide:false,shell:false,stdio:'ignore'});child=own;visible=true;
   own.once('exit',()=>{if(child===own){child=null;visible=false;}});own.once('error',()=>{if(child===own){child=null;visible=false;}});
  },
  backgroundLogin:async(signal)=>{if(!visible||!connection||!targetId)return;const {windowId}=await command('Browser.getWindowForTarget',{targetId},null,{signal,timeout:5000});await command('Browser.setWindowBounds',{windowId,bounds:{windowState:'minimized'}},null,{signal,timeout:5000});},
  // A timed-out check must not interrupt the user's explicit verification
  // window. Reconnect its transport on the next refresh without a restart.
  reset:async()=>{if(child&&child.exitCode==null){const own=connection;connection=null;session=null;targetId=null;own?.disconnect();return;}await closeBrowser();},
  close:()=>{closed=true;return closeBrowser();}
 };
}
module.exports={createOwnedWebBrowser,abortError,pause};
