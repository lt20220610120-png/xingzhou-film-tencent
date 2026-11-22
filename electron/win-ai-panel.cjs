const crypto=require('node:crypto');const {normalizeBounds}=require('./workbuddy-panel.cjs');const {createWinAITransport,ORIGIN}=require('./win-ai-transport.cjs');
function createWinAIPanel({getWindow,accessService,entry,WebContentsView,session,shell,onState=()=>{},transport=createWinAITransport,setInterval:interval=setInterval,clearInterval:clear=clearInterval}){
 let epoch=0,presentation=0,view=null,partition=null,timer=null,controller=null,ownerToken='',ready=false,visible=true,bounds=null;
 const paymentWindows=new Map();
 const clearSession=session=>Promise.allSettled(['closeAllConnections','clearStorageData','clearCache'].map(method=>Promise.resolve().then(()=>session?.[method]?.())));
 async function destroy(){clear(timer);timer=null;controller?.abort();controller=null;
  const oldView=view,oldSession=partition;view=null;partition=null;ready=false;ownerToken='';
  const payments=[...paymentWindows.values()].map(release=>release(true));
  try{oldView?.setVisible(false);getWindow()?.contentView.removeChildView(oldView);}catch{}
  try{oldView?.webContents.close({waitForBeforeUnload:false});}catch{}
  try{oldSession?.protocol.unhandle?.('https');}catch{}
  await Promise.allSettled([...payments,clearSession(oldSession)]);return true;
 }
 async function close(){epoch++;return destroy();}
 async function authorize(expected=epoch){const token=accessService.token();const account=await accessService.session();if(expected!==epoch)throw new Error('Win AI 打开已取消');if(!token||token!==accessService.token()||!account?.id||account.banned||(ownerToken&&ownerToken!==token)){await close();throw new Error('请登录有效的行舟影视账号后使用 Win AI');}return token;}
 function setBounds(value){if(!view)return false;bounds=normalizeBounds(value,getWindow().getContentBounds());view.setBounds(bounds);view.setVisible(visible&&ready&&bounds.width>0&&bounds.height>0);return true;}
 async function resume({bounds:value}={}){if(!view)return false;view.setVisible(false);const expected=epoch,ticket=++presentation;await authorize(expected);if(expected!==epoch||ticket!==presentation)return false;visible=true;return setBounds(value);}
 async function open({bounds:value,reconnect=false}={}){
  if(view&&ready&&!reconnect){await resume({bounds:value});return{connected:true};}
  const expected=++epoch;await destroy();if(expected!==epoch)throw new Error('Win AI 打开已取消');ownerToken=await authorize(expected);bounds=normalizeBounds(value,getWindow().getContentBounds());
  const verifier=crypto.randomBytes(32).toString('base64url'),challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
  const grant=await entry(challenge);if(expected!==epoch||ownerToken!==accessService.token())throw new Error('Win AI 登录已变更，请重新打开');
  const ownSession=session.fromPartition('xingzhou-win-ai-'+crypto.randomUUID());partition=ownSession;controller=new AbortController();
  // Electron includes the Chinese app name in its default UA. protocol.handle
  // converts Chromium headers to Fetch ByteString before invoking our handler.
  ownSession.setUserAgent(ownSession.getUserAgent().replace(/[^\x20-\x7e]/g,''));
  ownSession.setPermissionCheckHandler?.((_wc,permission,origin)=>permission==='clipboard-sanitized-write'&&origin===ORIGIN&&expected===epoch);
  ownSession.setPermissionRequestHandler((wc,permission,callback)=>callback(wc===view?.webContents&&permission==='clipboard-sanitized-write'&&expected===epoch));
  const handler=transport({session:ownSession,signal:controller.signal});
  ownSession.protocol.handle('https',async request=>{if(expected!==epoch)return new Response('Session closed',{status:403});try{return await handler(request);}catch{return new Response('Win AI 连接失败，请返回行舟影视重新连接。',{status:503,headers:{'content-type':'text/plain; charset=utf-8'}});}});
  const ownView=new WebContentsView({webPreferences:{session:ownSession,contextIsolation:true,nodeIntegration:false,sandbox:true}});view=ownView;visible=true;ownView.setVisible(false);
  const safeHttps=url=>{try{const safe=new URL(require('./ipc-security.cjs').safeExternalUrl(url));return safe.protocol==='https:'?safe:null;}catch{return null;}};
  const same=url=>safeHttps(url)?.origin===ORIGIN;
  ownView.webContents.setWindowOpenHandler(({url})=>{try{if(expected!==epoch)return{action:'deny'};if(same(url)){void ownView.webContents.loadURL(url).catch(()=>{});return{action:'deny'};}if(url!=='about:blank'&&!safeHttps(url))return{action:'deny'};const paymentSession=session.fromPartition('win-ai-payment-'+crypto.randomUUID());paymentSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));paymentSession.setPermissionCheckHandler?.(()=>false);return{action:'allow',overrideBrowserWindowOptions:{width:1080,height:820,title:'Win AI · 安全支付',autoHideMenuBar:true,parent:getWindow(),webPreferences:{session:paymentSession,sandbox:true,contextIsolation:true,nodeIntegration:false,preload:undefined}}};}catch{return{action:'deny'};}});
  ownView.webContents.on('did-create-window',popup=>{
   const paymentSession=popup.webContents.session;
   let closing;
   const release=destroyWindow=>{
    if(closing)return closing;
    closing=clearSession(paymentSession);paymentWindows.delete(popup);
    if(destroyWindow)try{popup.destroy();}catch{}
    return closing;
   };
   paymentWindows.set(popup,release);
   popup.on('closed',()=>{void release(false);if(expected===epoch&&view===ownView&&!ownView.webContents.isDestroyed?.())ownView.webContents.reload?.();});
   popup.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   for(const event of ['will-navigate','will-redirect'])popup.webContents.on(event,(e,legacyUrl)=>{const url=e.url||legacyUrl;if(same(url)){e.preventDefault();popup.close();}else if(!safeHttps(url))e.preventDefault();});
   if(expected!==epoch)void release(true);
  });
  for(const event of ['will-navigate','will-redirect','will-frame-navigate'])ownView.webContents.on(event,(e,legacyUrl)=>{if(!same(e.url||legacyUrl))e.preventDefault();});
  getWindow().contentView.addChildView(ownView);
  ownView.webContents.on('dom-ready',()=>{if(expected!==epoch||view!==ownView||ownerToken!==accessService.token())return;ready=true;setBounds(bounds);onState({ready:true});});
  try{const bootstrap=await handler(new Request(ORIGIN+'/api/win-ai/bootstrap',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({ticket:grant.ticket,verifier}).toString()}));
   const location=bootstrap.headers.get('location');void bootstrap.body?.cancel().catch(()=>{});
   if(bootstrap.status!==303||!location||new URL(location,ORIGIN).href!==ORIGIN+'/api/win-ai/start')throw new Error('Win AI 登录交接失败，请重新连接');
   if(expected!==epoch||ownerToken!==accessService.token())throw new Error('Win AI 打开已取消');
   timer=interval(()=>{authorize(expected).catch(async()=>{if(expected!==epoch)return;await close();onState({closed:true,error:'行舟账号已退出或暂时无法验证，请重新连接 Win AI'});});},15000);timer?.unref?.();
   await ownView.webContents.loadURL(ORIGIN+'/api/win-ai/start');if(expected!==epoch)throw new Error('Win AI 打开已取消');ready=true;setBounds(bounds);return{connected:true};
  }catch(error){if(expected===epoch)await close();throw error;}
 }
 return{open,resume,setBounds,close,async revoke(){await close();onState({closed:true,error:'行舟登录状态已更新，请重新连接 Win AI'});return true;},hide(){presentation++;if(!ready)return close();visible=false;view?.setVisible(false);return true;}};
}
module.exports={createWinAIPanel};
