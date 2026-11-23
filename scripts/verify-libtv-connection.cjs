const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {setTimeout:pause}=require('node:timers/promises');

const root=path.resolve(__dirname,'..');
const fixture='scripts/fixtures/libtv-connection.html';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv-connection-'));
app.setPath('userData',profile);
app.setPath('sessionData',profile);
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 let server,win,exit=0;
 try{
  const {createServer}=await import('vite');
  server=await createServer({root,configFile:false,cacheDir:path.join(profile,'vite-cache'),logLevel:'error',
   optimizeDeps:{entries:[fixture]},server:{host:'127.0.0.1',port:0,watch:null}});
  await server.listen();
  const local=server.resolvedUrls.local[0];
  win=new BrowserWindow({show:false,width:760,height:660,webPreferences:{backgroundThrottling:false}});
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},({url},done)=>done({cancel:!url.startsWith(local)}));
  const run=(fn,...args)=>win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')');
  const wait=async(fn,...args)=>{
   for(let i=0;i<100;i++){const result=await run(fn,...args);if(result)return result;await pause(40);}
   throw Error('Timed out: '+fn+' '+JSON.stringify(args));
  };
  const button=label=>wait(label=>{
   const node=[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===label&&!button.disabled);
   node?.click();return Boolean(node);
  },label);
  const input=value=>run(value=>{
   const node=document.querySelector('[aria-label="自定义代理地址"]');
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);
   node.dispatchEvent(new Event('input',{bubbles:true}));
  },value);
  const select=value=>run(value=>{
   const node=document.querySelector('select[aria-label="LibTV 网络模式"]');
   node.value=value;
   node.dispatchEvent(new Event('change',{bubbles:true}));
  },value);
  const text=()=>run(()=>document.querySelector('.libtv-connection').textContent);
  await win.loadURL(local+fixture);
  await wait(()=>document.querySelector('select[aria-label="LibTV 网络模式"]')?.value==='system');
  await select('direct');
  await wait(()=>libTVFixture.saved.at(-1)?.mode==='direct');
  await select('custom');
  await wait(()=>document.querySelector('[aria-label="自定义代理地址"]'));
  await input('http://fixture-user:fixture-password@localhost:7897');
  await button('应用代理');
  await wait(()=>document.querySelector('.libtv-connection [role=alert]')?.textContent.includes('用户名'));
  assert.equal(await run(()=>libTVFixture.saved.length),1);
  await input('socks5://localhost:7897');
  await button('应用代理');
  await wait(()=>libTVFixture.saved.at(-1)?.proxyUrl==='socks5://localhost:7897');

  await run(()=>{libTVFixture.report={ok:true,steps:[
   {stage:'account',ok:true,route:'custom-socks5',code:''},
   {stage:'models',ok:true,route:'custom-socks5',code:''},
  ]};});
  await button('连接测试');
  await wait(()=>document.querySelector('.libtv-network-report')?.textContent.includes('连接测试通过'));
  assert.match(await text(),/读取账号.*通过.*自定义代理.*SOCKS5/);
  assert.match(await text(),/读取模型列表.*通过/);

  await run(()=>{libTVFixture.report={ok:false,steps:[
   {stage:'account',ok:true,route:'system-http',code:''},
   {stage:'models',ok:false,route:'system-http',code:'TLS_TIMEOUT',detail:'Cookie fixture-cookie, Token fixture-token'},
   {stage:'invalid-stage',ok:false,route:'http://fixture-user:fixture-password@localhost:7897',code:'fixture-key'},
  ],suggestion:'账号 fixture-account-private，team fixture-team-private'};});
  await button('连接测试');
  await wait(()=>document.querySelector('.libtv-network-report')?.textContent.includes('TLS_TIMEOUT'));
  assert.match(await text(),/连接测试未通过.*读取模型列表.*失败.*系统代理.*TLS_TIMEOUT/);
  assert.match(await text(),/检查.*代理/);
  await button('复制诊断信息');
  const copied=await run(()=>libTVFixture.clipboard);
  assert.match(copied,/读取模型列表.*失败.*TLS_TIMEOUT/);
  assert.doesNotMatch(copied,/fixture-|7897|localhost|http:\/\//i);
  assert.doesNotMatch(await run(()=>document.querySelector('.libtv-network-report').textContent),/fixture-/);

  await run(()=>{libTVFixture.report={ok:false,steps:[
   {stage:'account',ok:false,route:'custom-socks5',code:'SOCKS_REPLY_2'},
  ]};});
  await button('连接测试');
  await wait(()=>document.querySelector('.libtv-network-report')?.textContent.includes('代理规则拒绝连接'));
  assert.equal(await run(()=>document.querySelector('.libtv-connection-status strong').textContent),'本机已授权 · 连接暂不可用');

  await run(()=>{libTVFixture.hold=true;});
  await button('连接测试');
  await wait(()=>typeof libTVFixture.finish==='function');
  await button('停止测试');
  await wait(()=>libTVFixture.cancellations===1);
  await run(()=>libTVFixture.finish({ok:true,steps:[{stage:'account',ok:true,route:'direct'}]}));
  await pause(100);
  assert.doesNotMatch(await text(),/连接测试通过/);
  await button('连接测试');
  await button('完成');
  await wait(()=>libTVFixture.cancellations===2);
  await button('打开连接设置');
  await wait(()=>document.querySelector('select[aria-label="LibTV 网络模式"]')?.value==='custom');
  for(const width of [760,1280,1920]){
   win.setContentSize(width,660);
   await pause(60);
   assert.equal(await run(()=>getComputedStyle(document.querySelector('select[aria-label="LibTV 网络模式"]')).appearance),'base-select');
   assert.ok(await run(()=>{
    const dialog=document.querySelector('[aria-label="连接 LibTV 账号"]'),rect=dialog.getBoundingClientRect();
    return rect.left>=0&&rect.right<=innerWidth&&dialog.scrollWidth<=dialog.clientWidth+1;
   }));
  }
  console.log(JSON.stringify({widths:[760,1280,1920],mode:true,invalidProxyRejected:true,successAndFailure:true,sanitizedCopy:true,abortAndDismiss:true}));
 }catch(error){console.error(error);exit=1;}
 finally{
  win?.destroy();
  await server?.close();
  await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200}).catch(()=>{});
  app.exit(exit);
 }
});
