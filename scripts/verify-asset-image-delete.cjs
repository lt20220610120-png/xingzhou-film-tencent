const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const temp=fs.realpathSync(os.tmpdir());
if(!process.versions.electron){
 const profile=fs.mkdtempSync(path.join(temp,'xz-asset-delete-ui-'));
 try{
  const child=require('node:child_process').spawnSync(require('electron'),[__filename,profile],{stdio:'inherit',windowsHide:true,timeout:120000});
  if(child.error)throw child.error;
  process.exitCode=child.status??1;
 }finally{fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:150});}
 return;
}
const {app,BrowserWindow,ipcMain}=require('electron');
const {setTimeout:pause}=require('node:timers/promises');
const {createLocalCollabService}=require('../electron/local-collab-service.cjs');
const {createCollabService}=require('../electron/collab-service.cjs');
const {handleAction}=require('../cloud-backend/src/collab.cjs');
const profile=fs.realpathSync(process.argv[2]);
assert.equal(path.dirname(profile),temp);
assert.match(path.basename(profile),/^xz-asset-delete-ui-[A-Za-z0-9]+$/);
app.setPath('userData',profile);app.setPath('sessionData',profile);app.disableHardwareAcceleration();
app.on('window-all-closed',()=>{});

const name='【隔离角色-便装】',otherName='【隔离角色-工装】';
const svg=(color)=>`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="24"><path fill="${color}" d="M0 0h40v24H0z"/></svg>`;
const urlFor=content=>`data:image/svg+xml;base64,${Buffer.from(content).toString('base64')}`;
const colors=['red','blue','green','purple','orange'];
const session={token:'fixture-session',account:{id:'wave-three-isolated',username:'qa',isProducer:true}};
const methods=new Set(['listProjects','getProject','listAssets','listMedia','deleteAssetImage','clearAssetImages']);

async function setup(mode, directory){
 let failure='',projectId, assetId, extraId, rows, pendingRefresh, calls=[];
 const images=colors.map((color,index)=>({id:`cloud-image-${index}`,url:urlFor(svg(color)),filename:color+'.svg',createdAt:`2026-11-25T02:00:0${index}Z`,kind:'asset-image'}));
 const source={name:'隔离资产删图',script:'第一集\n1-1 室内\n甲：测试。',episodes:[{id:'fixture-ep',title:'第一集',content:'1-1 室内\n甲：测试。'}]};
 let service,reopen;
 if(mode==='local'){
  const fallback=new Proxy({listProjects:async()=>[]},{get:(obj,key)=>obj[key]||(()=>{throw Error(`本机请求意外走云端 ${String(key)}`);})});
  const store=()=>createLocalCollabService({cloud:fallback,getSession:()=>session,getDirectory:()=>directory,isStorageLocked:()=>failure==='lock',
   mediaFor:()=>({materialize:structuredClone,storeFile:async file=>({...file,url:urlFor(await fs.promises.readFile(file.filePath))})})});
  service=store();reopen=store;
  const {id}=await service.createProject(source);projectId=id;
  assetId=(await service.createAsset({projectId,name,category:'character',episodes:[1]})).id;
  extraId=(await service.createAsset({projectId,name:otherName,category:'character',episodes:[1]})).id;
  for(const [index,color] of colors.entries()){
   const filePath=path.join(directory,color+'.svg');await fs.promises.writeFile(filePath,svg(color));
   images[index]=await service[index%2===0?'attachGeneratedAssetImage':'attachAssetImage']({projectId,assetId:index===4?extraId:assetId,filePath});
  }
  await service.updateAsset({projectId,assetId,updates:{adoptedImageId:images[1].id}});
 }else{
  projectId='cloud-project';assetId='fixture-asset';extraId='fixture-other';
  const project={...source,id:projectId,storageMode:'cloud',myRole:'producer',owner_id:session.account.id,created_at:'2026-11-25T02:00:00Z'};
  rows=[{id:assetId,name,images:images.slice(0,4),adoptedImageId:images[1].id,image_url:images[1].url},
   {id:extraId,name:otherName,images:images.slice(4),adoptedImageId:images[4].id,image_url:images[4].url}].map(row=>({...row,category:'character',first_episode:1,episodes:[1]}));
  reopen=()=>createCollabService(()=>session,{callGateway:async(action,payload)=>{
   if(action==='project-list')return [structuredClone(project)];
   assert.equal(payload.projectId,projectId);
   if(action==='project-get')return structuredClone(project);
   if(action==='assets-list')return structuredClone(rows);
   if(action==='media-list')return rows.flatMap(row=>row.images.map(image=>({...image,assetId:row.id})));
   if(failure==='network')throw Error('模拟网络异常，请稍后重试');
   const result=await handleAction(action,payload,session.account,{getProject:async()=>project,isProjectLocked:async()=>failure==='lock',
    deleteAssetImage:async(_id,p)=>{
     const row=rows.find(item=>item.images.some(image=>image.id===(p.mediaId||p.imageId)));
     if(!row)return null;
     row.images=row.images.filter(image=>image.id!==p.imageId);
     if(row.adoptedImageId===p.imageId){row.adoptedImageId=row.images.at(-1)?.id||null;row.image_url=row.images.at(-1)?.url||'';}
     return {id:p.imageId};
    }});
   if(result.status>=400)throw Error(result.body.error);
   return result.body;
  }});
  service=reopen();
 }
 return {projectId,assetId,extraId,images,calls,setFailure:value=>{failure=value;},
  delayNextRefresh(){
   let finish;
   pendingRefresh=new Promise(resolve=>{finish=resolve;});
   return finish;
  },
  call:async(method,payload)=>{
   assert.ok(methods.has(method));
   if(method==='deleteAssetImage')calls.push(structuredClone(payload));
   if(method==='listAssets'&&pendingRefresh){
    const refresh=pendingRefresh;
    pendingRefresh=null;
    if(!await refresh)throw Error('模拟刷新失败');
   }
   return service[method](payload);
  },read:()=>reopen().listAssets({projectId})};
}

app.whenReady().then(async()=>{
 let server,win,exit=0,fixture;
 try{
  const {createServer}=await import('vite');
  const page='scripts/fixtures/wave-three-ui.html';
  server=await createServer({root:path.join(__dirname,'..'),configFile:false,cacheDir:path.join(profile,'vite-cache'),
   optimizeDeps:{entries:[page]},server:{host:'127.0.0.1',port:0,watch:null},logLevel:'error'});
  await server.listen();const local=server.resolvedUrls.local[0],external=[];
  const preload=path.join(profile,'preload.cjs');
  fs.writeFileSync(preload,`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('assetDeletionFixture',{state:()=>ipcRenderer.invoke('asset-test-state'),call:(method,p)=>ipcRenderer.invoke('asset-test-call',method,p)});`);
  ipcMain.handle('asset-test-state',()=>({projectId:fixture.projectId}));
  ipcMain.handle('asset-test-call',(_,method,payload)=>fixture.call(method,payload));
  const widths=[1024,1440,1920],reports=[];
  for(const width of widths)for(const mode of ['local','cloud']){
   const directory=fs.mkdtempSync(path.join(profile,`${mode}-${width}-`));
   fixture=await setup(mode,directory);
   const {assetId,extraId,images,calls}=fixture;
   const box=`article[aria-label="${name}"] .collab-image-box`,dialog='dialog.workspace-dialog[open]';
   win=new BrowserWindow({width,height:830,show:false,webPreferences:{preload,backgroundThrottling:false}});
   win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},({url},done)=>{if(!url.startsWith(local))external.push(url);done({cancel:!url.startsWith(local)});});
   const run=(fn,...args)=>win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')');
   const until=async(fn,...args)=>{
    for(let i=0;i<80;i++){const value=await run(fn,...args);if(value)return value;await pause(50);}
    throw Error(`${mode}/${width} waiting for ${fn} ${JSON.stringify(args)}`);
   };
   const click=(selector,label)=>until((selector,label)=>{
    const button=[...document.querySelectorAll(selector)].find(node=>!node.disabled&&node.getClientRects().length&&(node.textContent.trim()===label||node.getAttribute('aria-label')===label));
    if(!button)return false;button.scrollIntoView({block:'nearest'});button.click();return true;
   },selector,label);
   const enter=async()=>{
    await click('#app-sidebar button','项目协作');
    await until(()=>Boolean(document.querySelector('.collab-rail')||document.querySelector('.collab-hub')));
    if(!await run(()=>Boolean(document.querySelector('.collab-rail'))))await click('.collab-hub button,.collab-hub [role=button]','进入项目');
    await click('.collab-rail button','资产');
   };
   const preview=(index,count)=>until((selector,src,count)=>{
    const node=document.querySelector(selector);if(!node)return false;
    return node.querySelector('.collab-panel-title .collab-ep-badge')?.textContent.trim()===`${count} 张` && (src?node.querySelector('.collab-asset-image-button img')?.src===src:!!node.querySelector('.collab-asset-image.empty'));
   },box,index===null?null:images[index].url,count);
   const check=(remaining,adopted)=>fixture.read().then(all=>{
    const target=all.find(row=>row.id===assetId),other=all.find(row=>row.id===extraId);
    assert.deepEqual(target.images.map(item=>item.id),remaining.map(i=>images[i].id));
    assert.equal(target.adoptedImageId,adopted===null?null:images[adopted].id);
    assert.deepEqual(other.images.map(item=>item.id),[images[4].id]);
   });
   const confirmDelete=async ()=>{await click(box+' button','删除图片');await click(dialog+' button','确认');};
   await win.loadURL(local+page+'?asset-image-delete');await enter();await preview(1,4);
   await click(box+' button','查看第 1 张图片');await preview(0,4);
   await click(box+' button','删除图片');
   await until(selector=>{
    const node=document.querySelector(selector);if(!node)return false;const rect=node.getBoundingClientRect();
    return Math.abs(rect.left+rect.width/2-innerWidth/2)<2&&Math.abs(rect.top+rect.height/2-innerHeight/2)<2;
   },dialog);
   await click(dialog+' button','取消');assert.equal(calls.length,0);await preview(0,4);
   await click(box+' button','删除图片');await until(selector=>Boolean(document.querySelector(selector)),dialog);
   await run(()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
   await until(selector=>!document.querySelector(selector),dialog);assert.equal(calls.length,0);await check([0,1,2,3],1);
   fixture.setFailure(mode==='local'?'lock':'network');await confirmDelete();
   await until((selector,message)=>document.querySelector(selector)?.textContent.includes(message),box,mode==='local'?'资料目录正在迁移':'模拟网络异常');
   await preview(0,4);await check([0,1,2,3],1);
   if(mode==='cloud'){
    fixture.setFailure('lock');await confirmDelete();
    await until(selector=>document.querySelector(selector)?.textContent.includes('项目已锁定'),box);
    await preview(0,4);await check([0,1,2,3],1);
   }
   fixture.setFailure('');
   const finishRefresh=fixture.delayNextRefresh();
   try{await confirmDelete();await preview(1,3);await check([1,2,3],1);}
   finally{finishRefresh(false);}
   await until((selector)=>document.querySelector(selector)?.textContent.includes('图片已删除，刷新失败'),box);
   await preview(1,3);
   assert.equal(calls.at(-1).assetId,assetId);assert.equal(calls.at(-1).imageId,images[0].id);
   await confirmDelete();await preview(3,2);await check([2,3],3);
   await click(box+' button','刷新图片');await preview(3,2);await check([2,3],3);
   await click(box+' button','查看第 1 张图片');await confirmDelete();await preview(3,1);await check([3],3);
   await confirmDelete();await preview(null,0);await check([],null);
   await win.reload();await enter();await preview(null,0);await check([],null);
   assert.deepEqual(await run(()=>window.waveThree.attemptedPaid),[]);
   reports.push({mode,width,centered:true,cancelled:2,failureVisible:true,refreshFailurePreservedDelete:true,adoption:true,emptyAndReopen:true,otherAssetPreserved:true});
   win.destroy();win=null;
  }
  assert.deepEqual(external,[]);
  console.log(JSON.stringify({reports,realPaidCalls:0}));
 }catch(error){
  exit=1;console.error(error);
  if(win&&!win.isDestroyed())console.error(await win.webContents.executeJavaScript(`({width:innerWidth,height:innerHeight,dialog:document.querySelector('dialog.workspace-dialog[open]')?.getBoundingClientRect().toJSON(),text:document.body.innerText.slice(-2700)})`).catch(()=>null));
 }
 finally{win?.destroy();await server?.close();app.exit(exit);}
});
