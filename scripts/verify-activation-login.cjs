const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const fixture='scripts/fixtures/activation-login.html';
const userData=fs.mkdtempSync(path.join(os.tmpdir(),'xz-activation-ui-'));
app.setPath('userData',userData);
app.whenReady().then(async()=>{
 let server,window;
 try {
  const {createServer}=await import('vite');
  server=await createServer({root,configFile:false,logLevel:'error',optimizeDeps:{entries:[fixture]},server:{host:'127.0.0.1',port:0,watch:null}});
  await server.listen();
  window=new BrowserWindow({show:false,width:520,height:450,webPreferences:{backgroundThrottling:false}});
  const run=code=>window.webContents.executeJavaScript(code);
  const wait=async code=>{
   for(let attempt=0;attempt<100;attempt++){
    if(await run(code))return;
    await new Promise(resolve=>setTimeout(resolve,40));
   }
   throw Error('Timed out: '+code);
  };
  const click=selector=>run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const load=()=>window.loadURL(server.resolvedUrls.local[0]+fixture);
  await load();
  await wait("document.querySelector('.startup-lock-login')&&!document.querySelector('.startup-lock-login').disabled");
  assert.equal(await run("document.querySelector('.startup-lock-login').textContent"),'已有账号登录');
  const lockBounds=await run("({top:document.querySelector('.startup-lock-card').getBoundingClientRect().top,bottom:document.querySelector('.startup-lock-card').getBoundingClientRect().bottom,innerHeight})");
  assert.ok(lockBounds.top>=0&&lockBounds.bottom<=lockBounds.innerHeight,JSON.stringify(lockBounds));
  await click('.startup-lock-login');
  await wait("document.activeElement.autocomplete==='username'&&activationFixture.stages.at(-1)==='account'");
  await run('activationFixture.finishStartup()');
  assert.equal(await run("Boolean(document.querySelector('#workspace'))"),false);
  assert.equal(await run("Boolean([...document.querySelectorAll('.auth-tabs button')].find(button=>button.textContent==='创建账号'))"),false);
  await click('.auth-return-to-activation');
  await wait("document.activeElement.id==='startup-card'&&activationFixture.stages.at(-1)==='lock'");
  assert.equal(await run("activationFixture.calls.includes('close')"),false);

  await click('.startup-lock-login');
  await wait("document.activeElement.autocomplete==='username'");
  await run("activationFixture.fill('[autocomplete=current-password]','typed-password')");
  await click('.auth-tabs button:last-child');
  await wait("document.querySelector('.auth-intro h1').textContent==='找回账号'");
  assert.equal(await run("document.querySelector('[autocomplete=new-password]').value"),'');
  await click('.auth-tabs button:first-child');
  await run("activationFixture.fill('[autocomplete=username]','monthly');activationFixture.fill('[autocomplete=current-password]','fixture-password');activationFixture.holdLogin()");
  await run("document.querySelector('.auth-card').requestSubmit();document.querySelector('.auth-card').requestSubmit()");
  await wait("document.querySelector('.auth-return-to-activation').disabled");
  assert.equal(await run("activationFixture.calls.filter(call=>call==='login:monthly').length"),1);
  await run("activationFixture.publish({status:'active',allowed:true,authenticated:true})");
  assert.equal(await run("Boolean(document.querySelector('#workspace'))"),false);
  await run("activationFixture.publish({status:'required',allowed:false,authenticated:false})");
  await run('activationFixture.finishLogin()');
  await wait("document.querySelector('.auth-error')?.textContent.includes('先输入卡密')");
  assert.equal(await run("Boolean(document.querySelector('#workspace'))"),false);

  await run("activationFixture.fill('[autocomplete=username]','existing');activationFixture.fill('[autocomplete=current-password]','fixture-password');activationFixture.holdCheck()");
  await click('.auth-submit');
  await wait("activationFixture.calls.includes('login:existing')&&document.querySelector('.auth-return-to-activation').disabled");
  assert.equal(await run("Boolean(document.querySelector('#workspace'))"),false);
  await run("activationFixture.publish({status:'exempt',allowed:true});activationFixture.finishCheck({status:'required',allowed:false,authenticated:false})");
  await wait("!document.querySelector('.auth-submit').disabled");
  assert.equal(await run("Boolean(document.querySelector('#workspace'))"),false);
  await run("activationFixture.publish({status:'exempt',allowed:true,authenticated:true})");
  await wait("document.querySelector('#workspace')&&activationFixture.stages.at(-1)==='workspace'");
  assert.equal(await run("activationFixture.calls.includes('prepare')"),false);

  await load();
  await wait("document.querySelector('.startup-lock-login')");
  await run('activationFixture.failStartup()');
  await wait("document.querySelector('.startup-lock-error')?.textContent.includes('网络暂不可用')");
  await click('.startup-lock-card [type=submit]');
  await wait("document.querySelector('#startup-card')&&!document.querySelector('#startup-card').disabled");
  await click('.startup-lock-login');
  await wait("document.querySelector('.auth-return-to-activation')");
  await click('.auth-return-to-activation');
  await wait("document.activeElement.id==='startup-card'");
  await run("activationFixture.fill('#startup-card','fixture-card')");
  await click('.startup-lock-card [type=submit]');
  await wait("[...document.querySelectorAll('.auth-tabs button')].some(button=>button.textContent==='创建账号')");
  assert.equal(await run("activationFixture.calls.filter(call=>call==='prepare').length"),1);
  assert.equal(await run("Boolean(document.querySelector('#workspace'))"),false);
  console.log('Isolated Electron activation/login passed: navigation/focus, recovery form, monthly denial, stale grant, exempt grant, network retry and card registration.');
 }catch(error){
  console.error(error);
  process.exitCode=1;
 }finally{
  window?.destroy();
  await server?.close();
  app.exit(process.exitCode||0);
 }
});
