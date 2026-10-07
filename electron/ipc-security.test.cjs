const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {pathToFileURL}=require('node:url');
const {createSecureIpc,safeExternalUrl,protectWindow,canvasPage}=require('./ipc-security.cjs');
function fixture(service={token:()=>'',session:async()=>null}){
 const handlers=new Map(),entryFile=path.resolve('dist/index.html');const frame={url:pathToFileURL(entryFile).href};const win={isDestroyed:()=>false,webContents:{mainFrame:frame}};
 const guard=createSecureIpc({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},getWindow:()=>win,entryFile,isDev:false,getAccessService:()=>service});
 return {handlers,guard,win,event:()=>({sender:win.webContents,senderFrame:frame})};
}
test('所有入口拒绝其他窗口、子 frame 和主窗口内的远程页面',async()=>{
 const f=fixture();let calls=0;f.guard.handle('save-state',()=>{calls++});const handler=f.handlers.get('save-state');
 await assert.rejects(()=>handler({...f.event(),sender:{}}),/主工作区/);
 await assert.rejects(()=>handler({...f.event(),senderFrame:{url:f.event().senderFrame.url}}),/主工作区/);
 f.win.webContents.mainFrame.url='https://attacker.invalid';await assert.rejects(()=>handler(f.event()),/主工作区/);assert.equal(calls,0);
});
test('未登录时可本地编辑保存，但不允许联网生成',async()=>{
 const f=fixture();let calls=0;f.guard.handle('save-state',(_event,value)=>value);f.guard.handle('ai-chat',()=>{calls++});
 assert.deepEqual(await f.handlers.get('save-state')(f.event(),{content:'离线草稿'}),{content:'离线草稿'});
 await assert.rejects(()=>f.handlers.get('ai-chat')(f.event(),{prompt:'test',account:{id:'forged'}}),/登录/);assert.equal(calls,0);
});
test('有效账号允许生成，退出使在途请求收到中止信号，旧验证结果不能启动新请求',async()=>{
 let token='valid',resolveSession;const service={token:()=>token,session:async()=>({id:'u',banned:false})};const f=fixture(service);
 let begin;const begun=new Promise(resolve=>begin=resolve);
 f.guard.handle('ai-chat',event=>new Promise((resolve,reject)=>{begin();event.securitySignal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})}));
 f.guard.handle('auth-logout',()=>{token='';return true});
 const running=f.handlers.get('ai-chat')(f.event(),{});const rejected=assert.rejects(()=>running,/aborted/);await begun;
 await f.handlers.get('auth-logout')(f.event());await rejected;
 token='valid';service.session=()=>new Promise(resolve=>resolveSession=resolve);
 const pending=f.handlers.get('ai-chat')(f.event(),{});const denied=assert.rejects(()=>pending,/状态已变化/);
 await f.handlers.get('auth-logout')(f.event());resolveSession({id:'u'});await denied;
});
test('封禁和失效账号不能生成，非法参数不会到达服务端',async()=>{
 let calls=0;const f=fixture({token:()=> 'valid',session:async()=>{calls++;return {id:'u',banned:true}}});f.guard.handle('media-generate-image',()=>assert.fail('must not run'));
 await assert.rejects(()=>f.handlers.get('media-generate-image')(f.event(),{endpoint:'file:///secret',prompt:'test'}));assert.equal(calls,0);
 await assert.rejects(()=>f.handlers.get('media-generate-image')(f.event(),{}),/有效账号/);assert.equal(calls,1);
});
test('账号正在切换时不允许使用仍在磁盘上的旧会话启动生成',async()=>{
 const f=fixture({token:()=> 'old',session:async()=>({id:'old'})});let finish;
 f.guard.handle('auth-login',()=>new Promise(resolve=>finish=resolve));f.guard.handle('ai-chat',()=>assert.fail('must not start'));
 const login=f.handlers.get('auth-login')(f.event(),{});
 await assert.rejects(()=>f.handlers.get('ai-chat')(f.event(),{}),/正在切换/);finish({id:'new'});await login;
});
test('不启动本地执行协议，新窗口被拒绝，主工作区导航不能进入外站',()=>{
 for(const value of ['file:///C:/secret','javascript:alert(1)','powershell:run','https://name:pass@example.com'])assert.throws(()=>safeExternalUrl(value));
 assert.equal(safeExternalUrl('https://example.com'),'https://example.com/');
 const callbacks={};let popup;const win={webContents:{on:(name,fn)=>callbacks[name]=fn,setWindowOpenHandler:fn=>popup=fn}};
 protectWindow(win,{entryFile:path.resolve('dist/index.html'),isDev:false,allowFrameUrl:canvasPage});let prevented=false;
 callbacks['will-navigate']({preventDefault:()=>prevented=true},'https://evil.invalid');assert.equal(prevented,true);assert.deepEqual(popup({url:'javascript:alert(1)'}),{action:'deny'});
 prevented=false;callbacks['will-frame-navigate']({url:'xzapp://canvas/index.html#/canvas',isMainFrame:false,preventDefault:()=>prevented=true});assert.equal(prevented,false);
 callbacks['will-frame-navigate']({url:'xzapp://canvas/index.html',isMainFrame:false,preventDefault:()=>prevented=true},'xzapp://canvas/index.html',false,false);assert.equal(prevented,false);
 callbacks['will-frame-navigate']({url:'xzapp://canvas/index.html',isMainFrame:true,preventDefault:()=>prevented=true});assert.equal(prevented,true);
});
