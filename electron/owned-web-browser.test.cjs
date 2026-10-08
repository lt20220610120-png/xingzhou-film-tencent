const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {createOwnedWebBrowser}=require('./owned-web-browser.cjs');
test('a failed login spawn with no exit event can be retried instead of reusing a nonexistent process',async t=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'xz-owned-retry-test-'));t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));let launches=0,child;
 class Socket extends EventTarget{
  constructor(){super();this.readyState=0;queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}
  send(text){const r=JSON.parse(text),result=r.method==='Target.getTargets'?{targetInfos:[{type:'page',url:'https://chatgpt.com/',targetId:'own'}]}:r.method==='Target.attachToTarget'?{sessionId:'attached'}:r.method==='Browser.getWindowForTarget'?{windowId:1}:{};queueMicrotask(()=>{const e=new Event('message');e.data=JSON.stringify({id:r.id,result});this.dispatchEvent(e);if(r.method==='Browser.close'){child.exitCode=0;child.emit('exit',0);}});}
  close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
 }
 const browser=createOwnedWebBrowser({profileDir:profile,url:'https://chatgpt.com/',name:'ChatGPT',WebSocket:Socket,startupTimeoutMs:1000,findBrowser:()=>'/browser',spawn:()=>{
  child=Object.assign(new EventEmitter(),{exitCode:null,kill(){this.exitCode=0;this.emit('exit',0);}});
  if(++launches===1){const failed=child;queueMicrotask(()=>{failed.emit('error',Object.assign(new Error('spawn unavailable'),{code:'ENOENT'}));failed.emit('close',-1);});}
  else fs.writeFileSync(path.join(profile,'DevToolsActivePort'),'9000\n/devtools/browser/abc-123');return child;
 }});
 try{await assert.rejects(browser.openLogin(),e=>e.code==='WEB_BROWSER_UNAVAILABLE');await browser.openLogin();assert.equal(launches,2);}finally{await browser.close();}
});

test('refresh attaches to the existing explicit login browser and minimizes only its owned window',async t=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'xz-owned-login-test-'));t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));
 const launches=[],commands=[];let child;
 class Socket extends EventTarget{
  constructor(){super();this.readyState=0;queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}
  send(text){const req=JSON.parse(text);commands.push(req);const result=req.method==='Target.getTargets'?{targetInfos:[{type:'page',url:'https://chatgpt.com/',targetId:'owned'}]}:req.method==='Target.attachToTarget'?{sessionId:'session'}:req.method==='Browser.getWindowForTarget'?{windowId:42}:{};queueMicrotask(()=>{const e=new Event('message');e.data=JSON.stringify({id:req.id,result});this.dispatchEvent(e);if(req.method==='Browser.close'){child.exitCode=0;child.emit('exit',0);}});}
  close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
 }
 const browser=createOwnedWebBrowser({profileDir:profile,url:'https://chatgpt.com/',name:'ChatGPT',WebSocket:Socket,findBrowser:()=>'/owned-browser',spawn:(exe,args,options)=>{launches.push({exe,args,options});child=Object.assign(new EventEmitter(),{exitCode:null,kill(){this.exitCode=0;this.emit('exit',0);}});fs.writeFileSync(path.join(profile,'DevToolsActivePort'),'9000\n/devtools/browser/abc-123');return child;}});
 try{await browser.openLogin();assert.ok(launches[0].args.includes('--remote-debugging-port=0'));await browser.ensure();await browser.backgroundLogin();await browser.ensure();assert.equal(launches.length,1);assert.equal(commands.filter(c=>c.method==='Target.attachToTarget').length,1);assert.deepEqual(commands.filter(c=>c.method==='Browser.setWindowBounds').at(-1).params,{windowId:42,bounds:{windowState:'minimized'}});await browser.openLogin();assert.equal(launches.length,1);assert.deepEqual(commands.filter(c=>c.method==='Browser.setWindowBounds').at(-1).params,{windowId:42,bounds:{windowState:'normal'}});await browser.reset();assert.equal(child.exitCode,null);await browser.ensure();assert.equal(launches.length,1);assert.equal(commands.some(c=>c.method==='Browser.close'),false);}finally{await browser.close();}
});

test('a stalled browser websocket honors account-check cancellation and releases the owned browser', {timeout:2000},async t=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'xz-owned-abort-test-'));t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));let child;
 class Socket extends EventTarget{constructor(){super();this.readyState=0;}close(){this.readyState=3;this.dispatchEvent(new Event('close'));}}
 const browser=createOwnedWebBrowser({profileDir:profile,url:'https://chatgpt.com/',name:'ChatGPT',WebSocket:Socket,findBrowser:()=>'/owned-browser',spawn:()=>{child=Object.assign(new EventEmitter(),{exitCode:null,stdin:{writable:true,end(){child.exitCode=0;child.emit('exit',0);}},stderr:new EventEmitter(),kill(){this.exitCode=0;this.emit('exit',0);}});fs.writeFileSync(path.join(profile,'DevToolsActivePort'),'9000\n/devtools/browser/abc-123');return child;}});
 const controller=new AbortController();const pending=browser.ensure(controller.signal);setTimeout(()=>controller.abort(),20);
 try{await assert.rejects(pending,e=>e.name==='AbortError');assert.notEqual(child.exitCode,null);}finally{await browser.close();}
});

test('failed page attachment reconnects without closing the explicit login window or evaluating without a session',async t=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'xz-owned-reattach-test-'));t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));
 const sockets=[],commands=[];let child,launches=0,attachments=0;
 class Socket extends EventTarget{
  constructor(){super();sockets.push(this);this.readyState=0;queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}
  send(text){const req=JSON.parse(text);commands.push(req);let response;
   if(req.method==='Target.getTargets')response={result:{targetInfos:[{type:'page',url:'https://chatgpt.com/',targetId:'owned'}]}};
   else if(req.method==='Target.attachToTarget')response=++attachments===1?{error:{message:'target unavailable'}}:{result:{sessionId:'recovered'}};
   else if(req.method==='Runtime.evaluate')response=req.sessionId==='recovered'?{result:{result:{value:'connected'}}}:{error:{message:'missing page session'}};
   else response={result:{}};
   queueMicrotask(()=>{const e=new Event('message');e.data=JSON.stringify({id:req.id,...response});this.dispatchEvent(e);if(req.method==='Browser.close'){child.exitCode=0;child.emit('exit',0);}});
  }
  close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
 }
 const browser=createOwnedWebBrowser({profileDir:profile,url:'https://chatgpt.com/',name:'ChatGPT',WebSocket:Socket,findBrowser:()=>'/owned-browser',spawn:()=>{launches++;child=Object.assign(new EventEmitter(),{exitCode:null,kill(){this.exitCode=0;this.emit('exit',0);}});fs.writeFileSync(path.join(profile,'DevToolsActivePort'),'9000\n/devtools/browser/abc-123');return child;}});
 try{
  await assert.rejects(browser.openLogin(),/ChatGPT.*执行失败/);
  assert.equal(sockets[0].readyState,3);assert.equal(child.exitCode,null);assert.equal(commands.some(c=>c.method==='Browser.close'),false);
  await browser.ensure();assert.equal(await browser.evaluate('true'),'connected');assert.equal(attachments,2);assert.equal(launches,1);assert.equal(sockets.length,2);assert.equal(commands.find(c=>c.method==='Runtime.evaluate').sessionId,'recovered');
 }finally{await browser.close();}
});

test('opening manual verification reuses an already running background browser without reload or restart',async t=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'xz-owned-login-test-'));t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));
 const launches=[],commands=[];let child;
 class Socket extends EventTarget{
  constructor(){super();this.readyState=0;queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}
  send(text){const req=JSON.parse(text);commands.push(req);const result=req.method==='Target.getTargets'?{targetInfos:[{type:'page',url:'https://chatgpt.com/',targetId:'owned'}]}:req.method==='Target.attachToTarget'?{sessionId:'session'}:req.method==='Browser.getWindowForTarget'?{windowId:42}:{};queueMicrotask(()=>{const e=new Event('message');e.data=JSON.stringify({id:req.id,result});this.dispatchEvent(e);if(req.method==='Browser.close'){child.exitCode=0;child.emit('exit',0);}});}
  close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
 }
 const browser=createOwnedWebBrowser({profileDir:profile,url:'https://chatgpt.com/',name:'ChatGPT',WebSocket:Socket,findBrowser:()=>'/owned-browser',spawn:(exe,args,options)=>{launches.push({exe,args,options});child=Object.assign(new EventEmitter(),{exitCode:null,kill(){this.exitCode=0;this.emit('exit',0);}});fs.writeFileSync(path.join(profile,'DevToolsActivePort'),'9000\n/devtools/browser/abc-123');return child;}});
 try{await browser.ensure();await browser.openLogin();await browser.ensure();assert.equal(launches.length,1);assert.equal(commands.some(c=>c.method==='Browser.close'||c.method==='Page.navigate'),false);await browser.reset();await browser.ensure();assert.equal(launches.length,1);}finally{await browser.close();}
});
