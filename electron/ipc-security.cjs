const { pathToFileURL } = require('node:url');
const identityChanges = new Set(['auth-login', 'auth-register', 'auth-logout', 'auth-recover', 'auth-unlock-role']);
const onlineChannels = new Set(['ai-chat', 'test-ai-connection', 'discover-models', 'generation-submit', 'generation-refresh', 'media-generate-image', 'media-generate-video', 'media-retry-image-download', 'collab-generate-asset-image', 'collab-generate-video']);
const stringChannels = new Set(['open-external', 'check-update', 'media-import-file', 'media-import-files']);
function trustedPage(url, { entryFile, isDev }) {
  try {
    const actual = new URL(url);actual.hash='';actual.search='';
    if(isDev && actual.origin==='http://127.0.0.1:5173' && actual.pathname==='/')return true;
    return actual.href===pathToFileURL(entryFile).href;
  } catch { return false; }
}
function assertSender(event, win, options) {
  if(!win || win.isDestroyed() || event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame || !trustedPage(event.senderFrame?.url,options))throw new Error('只允许行舟主工作区调用此功能');
}
function validatePayload(channel,value) {
  if(value===undefined || value===null)return;
  if(stringChannels.has(channel)){if(typeof value!=='string'||value.length>8192)throw new Error('功能参数格式无效');return;}
  if(channel==='save-director-projects'){if(!Array.isArray(value))throw new Error('导演项目必须是列表');return;}
  if(typeof value!=='object'||Array.isArray(value))throw new Error('功能参数必须是对象');
  if(onlineChannels.has(channel)) {
    for(const key of ['prompt','model','apiKey','endpoint','taskId','id'])if(value[key]!==undefined && (typeof value[key]!=='string'||value[key].length>(key==='prompt'?4*1024*1024:8192)))throw new Error('生成参数格式无效');
    if(value.endpoint){const url=new URL(value.endpoint);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('接口地址格式无效');}
    for(const key of ['messages','references'])if(value[key]!==undefined&&(!Array.isArray(value[key])||value[key].length>(key==='messages'?10000:256)))throw new Error('生成内容列表无效');
    if(value.messages?.some(message=>!message||typeof message!=='object'||!['system','user','assistant','tool','developer'].includes(message.role)))throw new Error('对话消息格式无效');
  }
}
function safeExternalUrl(value) {
  if(typeof value!=='string'||value.length>8192)throw new Error('外部链接无效');
  const url=new URL(value);
  if(!['https:','http:','mailto:'].includes(url.protocol)||url.username||url.password||/[\r\n\x00]/.test(value))throw new Error('不允许打开此链接协议');
  return url.href;
}
function canvasPage(value){try{const url=new URL(value);return url.protocol==='xzapp:'&&url.hostname==='canvas'&&url.pathname==='/index.html';}catch{return false;}}
function protectWindow(win, { entryFile,isDev,allowUrl,allowFrameUrl,openExternal }) {
  const allowed=allowUrl || (url=>trustedPage(url,{entryFile,isDev}));
  win.webContents.on('will-navigate',(event,url)=>{if(!allowed(url))event.preventDefault();});
  win.webContents.on('will-redirect',(event,url)=>{if(!allowed(url))event.preventDefault();});
  win.webContents.on('will-frame-navigate',(event,legacyUrl,_isInPlace,legacyIsMainFrame)=>{const url=event.url||legacyUrl;const isMainFrame=event.isMainFrame??legacyIsMainFrame;const permitted=allowed(url)||(isMainFrame===false&&allowFrameUrl?.(url));if(!permitted)event.preventDefault();});
  win.webContents.setWindowOpenHandler(({url})=>{try{const safe=safeExternalUrl(url);Promise.resolve(openExternal?.(safe)).catch(()=>{});}catch{}return {action:'deny'};});
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
}
function createSecureIpc({ ipcMain,getWindow,entryFile,isDev,getAccessService,onIdentityChange=()=>{} }) {
  let epoch=0,transitions=0;const active=new Set();
  const invalidate=()=>{epoch++;for(const controller of active)controller.abort();onIdentityChange();};
  return {
    invalidate,
    handle(channel,handler){
      // Every bridge handler gets provenance validation, including local saves and login.
      ipcMain.handle(channel,async(event,...args)=>{
        assertSender(event,getWindow(),{entryFile,isDev});validatePayload(channel,args[0]);
        if(identityChanges.has(channel)){transitions++;invalidate();}
        const expected=epoch;let controller;
        try {
          if(onlineChannels.has(channel)) {
            if(transitions)throw new Error('账号正在切换，请稍后使用联网生成');
            const service=getAccessService(),token=service?.token();
            const account=await service?.session();
            if(expected!==epoch || !token || service.token()!==token)throw new Error('登录状态已变化，请重新操作');
            if(!account?.id || account.banned===true){invalidate();throw new Error('请先登录有效账号，再使用联网生成');}
            assertSender(event,getWindow(),{entryFile,isDev});
            controller=new AbortController();active.add(controller);event.securitySignal=controller.signal;
          }
          const result=await handler(event,...args);
          if(controller && expected!==epoch)throw new Error('登录状态已变化，任务已停止');
          return result;
        } finally {if(controller)active.delete(controller);if(identityChanges.has(channel)){transitions--;invalidate();}}
      });
    },
  };
}
module.exports={createSecureIpc,assertSender,trustedPage,validatePayload,safeExternalUrl,protectWindow,canvasPage};
