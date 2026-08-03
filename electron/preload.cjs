const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('xingzhou',{
 saveTxt:payload=>ipcRenderer.invoke('save-txt',payload),aiChat:payload=>ipcRenderer.invoke('ai-chat',payload),testAiConnection:payload=>ipcRenderer.invoke('test-ai-connection',payload),importFullScript:()=>ipcRenderer.invoke('import-full-script'),
 importSkillDirectory:()=>ipcRenderer.invoke('import-skill-directory'),importSkillDocument:()=>ipcRenderer.invoke('import-skill-document'),
 storageInfo:()=>ipcRenderer.invoke('storage-info'),loadState:()=>ipcRenderer.invoke('load-state'),saveState:state=>ipcRenderer.invoke('save-state',state),
 selectDataDir:state=>ipcRenderer.invoke('select-data-dir',state),openDataDir:()=>ipcRenderer.invoke('open-data-dir'),
 appVersion:()=>ipcRenderer.invoke('app-version'),checkUpdate:url=>ipcRenderer.invoke('check-update',url),
 downloadUpdate:payload=>ipcRenderer.invoke('download-update',payload),installUpdate:()=>ipcRenderer.invoke('install-update'),
 onUpdateProgress:callback=>{const handler=(_event,data)=>callback(data);ipcRenderer.on('update-progress',handler);return()=>ipcRenderer.removeListener('update-progress',handler)},
 openExternal:url=>ipcRenderer.invoke('open-external',url)
});
