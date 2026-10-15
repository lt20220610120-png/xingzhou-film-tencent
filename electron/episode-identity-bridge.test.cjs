const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
test('identity repair crosses preload, main and authenticated gateway without dropping the baseline',async()=>{
 let bridge;const calls=[];const electron={contextBridge:{exposeInMainWorld:(_name,value)=>bridge=value},ipcRenderer:{invoke:(...args)=>{calls.push(args);return Promise.resolve(true)},on(){},removeListener(){}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./preload.cjs'),'utf8'),{require:name=>{assert.equal(name,'electron');return electron;}});
 const payload={projectId:'p',baseEpisodes:[{id:'keep',content:'原稿'}],operation:'remove',index:0};
 assert.equal(typeof bridge.collabResolveEpisodeIdentity,'function');await bridge.collabResolveEpisodeIdentity(payload);assert.deepEqual(calls[0],['collab-resolve-episode-identity',payload]);
 const {createCollabService}=require('./collab-service.cjs');const service=createCollabService(()=>({token:'session-token'}),{callGateway:async(...args)=>{calls.push(args);return true}});
 await service.resolveEpisodeIdentity(payload);assert.deepEqual(calls.at(-1),['episode-identity-resolve',payload,'session-token']);
 assert.match(fs.readFileSync(require.resolve('./main.cjs'),'utf8'),/ipcMain\.handle\('collab-resolve-episode-identity',\(_,p\)=>collabService\.resolveEpisodeIdentity\(p\)\)/);
});
test('identity repair IPC rejects another window before the gateway can run',async()=>{
 const {createSecureIpc}=require('./ipc-security.cjs');const {pathToFileURL}=require('node:url');const path=require('node:path');
 let handler,calls=0;const entryFile=path.resolve('dist/index.html'),frame={url:pathToFileURL(entryFile).href},webContents={mainFrame:frame};
 createSecureIpc({ipcMain:{handle:(_name,fn)=>handler=fn},entryFile,isDev:false,getWindow:()=>({isDestroyed:()=>false,webContents}),getAccessService:()=>({})}).handle('collab-resolve-episode-identity',()=>{calls++});
 await assert.rejects(handler({sender:{},senderFrame:frame},{projectId:'p'}),/主工作区/);assert.equal(calls,0);
 await handler({sender:webContents,senderFrame:frame},{projectId:'p'});assert.equal(calls,1);
});
