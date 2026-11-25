// Run with: node scripts/fixtures/local-share-media-smoke.cjs
// Production preload, desktop persistence and signed uploader, with a loopback Gateway/COS fixture.
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {once} = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');
const {app, BrowserWindow, ipcMain, net, session} = electron;
const {createLocalCollabService} = require('../../electron/local-collab-service.cjs');
const {createLocalProjectMedia} = require('../../electron/local-project-media.cjs');
const {createCollabService, uploadToBucket} = require('../../electron/collab-service.cjs');
const {createDesktopAPIFetch} = require('../../electron/desktop-api-transport.cjs');
const {configureAPIFetch} = require('../../electron/win-ai-api-fetch.cjs');

const root = process.env.XINGZHOU_LOCAL_SHARE_SMOKE_ROOT;

async function read(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function loopback() {
  const requests = [], signatures = new Map(), uploaded = new Map();
  const state = {requests,uploaded,legacyPrepare:true,interrupt:false,pending:null,committed:null};
  const server = http.createServer(async (request, response) => {
    const send = (status, body) => response.writeHead(status, {'content-type':'application/json'}).end(JSON.stringify(body));
    if (request.method === 'PUT') {
      const objectKey = request.url.slice(1);
      const signed = signatures.get(objectKey);
      if (!signed || request.headers.authorization !== signed.authorization) return response.writeHead(403).end();
      const bytes = await read(request);
      if (state.interrupt && signed.kind === 'audio') return response.writeHead(400).end();
      uploaded.set(objectKey,bytes.toString());
      return response.writeHead(200).end();
    }
    if (request.method !== 'POST' || request.url !== '/api/gateway'
      || request.headers.authorization !== 'Bearer fixture-session') return send(401, {error:'unrecognized test request'});
    const {action,...data} = JSON.parse(await read(request));
    requests.push({action,data});
    if (action === 'project-local-share-prepare') {
      if (state.pending?.requestId !== data.requestId) {
        if (data.revision !== null) return send(409,{error:'未能替换已中断的邀请'});
        state.pending = {...data,revision:randomUUID()};
      }
      return send(200,{revision:state.pending.revision,...(state.legacyPrepare?{}:{pending:true})});
    }
    if (action === 'media-upload-url') {
      if (!state.pending || state.pending.requestId !== data.localShareRequestId) {
        return send(403,{error:'你没有这个项目的操作权限'});
      }
      const objectKey = `projects/${data.projectId}/${data.kind}/${randomUUID()}${path.extname(data.filename)}`;
      const signed = {method:'PUT',url:state.origin+'/'+objectKey,authorization:randomUUID(),objectKey,contentType:data.mime,kind:data.kind};
      signatures.set(objectKey,signed);
      return send(200,signed);
    }
    if (action === 'project-local-share') {
      if (data.requestId !== state.pending?.requestId || data.revision !== state.pending.revision) {
        return send(409,{error:'邀请准备不一致'});
      }
      state.committed = data;
      return send(200,{project:data.project,member:{id:'fixture-member',username:data.invitation.username,role:data.invitation.role}});
    }
    if (action === 'project-get' && state.committed) return send(200,state.committed.project);
    return send(500,{error:'unexpected test action '+action});
  });
  return {state,server};
}

async function verify() {
  const {state,server} = loopback();
  const handlers = new Map([
    ['collab-create-project','createProject'],
    ['collab-get-project','getProject'],
    ['collab-create-asset','createAsset'],
    ['collab-upload-asset-image','attachAssetImage'],
    ['collab-upload-media','uploadMedia'],
    ['collab-list-media','listMedia'],
    ['collab-patch-storyboard','patchStoryboard'],
    ['collab-add-member','addMember'],
  ]);
  let window;
  try {
    server.listen(0,'127.0.0.1');
    await once(server,'listening');
    state.origin = 'http://127.0.0.1:'+server.address().port;
    session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']}, (details, done) => {
      done({cancel:new URL(details.url).origin!==state.origin});
    });
    const desktopFetch = createDesktopAPIFetch(net);
    configureAPIFetch(desktopFetch);
    const identity = {account:{id:randomUUID(),username:'fixture_owner',isProducer:true},token:'fixture-session'};
    async function gateway(action, payload, token) {
      const response = await desktopFetch(state.origin+'/api/gateway',{method:'POST',redirect:'error',
        headers:{authorization:'Bearer '+token,'content-type':'application/json'},
        body:JSON.stringify({action,...payload})});
      const body = await response.json();
      if (!response.ok) throw Object.assign(Error(body.error),{status:response.status});
      return body;
    }
    let adoptedVoice;
    const cloud = createCollabService(()=>identity,{callGateway:gateway});
    const setup = () => createLocalCollabService({cloud,getSession:()=>identity,getDirectory:()=>root,
      adoptedVoices:()=> adoptedVoice ? {role:{confirmed:adoptedVoice}} : {},
      mediaFor:({root:mediaRoot,token}) => createLocalProjectMedia({root:mediaRoot,
        upload:(id,file,kind,context)=>uploadToBucket(id,file,kind,token,null,{...context,requestSignature:gateway}),
      }),
    });
    let service = setup();
    for (const [channel, method] of handlers) ipcMain.handle(channel, (_, payload)=>service[method](payload));
    window = new BrowserWindow({show:false,webPreferences:{preload:path.resolve(__dirname,'../../electron/preload.cjs'),contextIsolation:true,sandbox:true}});
    await window.loadURL('about:blank');
    const call = (method,payload) => window.webContents.executeJavaScript(`window.xingzhou[${JSON.stringify(method)}](${JSON.stringify(payload)})`);
    const localDirector = '1795323477214-fixture';
    const project = await call('collabCreateProject',{name:'隔离共享项目',script:'1-1 室内',directorProjectId:localDirector,
      episodes:[{id:'ep',episodeNumber:1,title:'第1集',content:'1-1 室内',
        storyboardPrompts:[{id:'shot',label:'1-1-1',content:'甲开门。'}]}]});
    const projectId = project.id;
    const asset = await call('collabCreateAsset',{projectId,category:'character',name:'甲'});
    const files = {};
    for (const name of ['asset.png','voice.wav','reference.png','reference.mp4']) {
      files[name] = path.join(root,name);
      fs.writeFileSync(files[name],'isolated '+name);
    }
    const photo = await call('collabUploadAssetImage',{projectId,assetId:asset.id,filePath:files['asset.png']});
    adoptedVoice = await call('collabUploadMedia',{projectId,kind:'audio',filePath:files['voice.wav']});
    const reference = await call('collabUploadMedia',{projectId,kind:'image',filePath:files['reference.png']});
    const video = await call('collabUploadMedia',{projectId,kind:'video',filePath:files['reference.mp4']});
    await call('collabPatchStoryboard',{projectId,episodeId:'ep',shotId:'shot',editPolicy:'direct',
      updates:{generationConfig:{references:[reference,video]}}});
    const originalInvitation = {projectId,username:'fixture_first',role:'artist'};
    await assert.rejects(call('collabAddMember',originalInvitation),/操作权限/);
    const firstId = state.pending.requestId;
    assert.equal(state.uploaded.size,0);
    assert.equal(state.committed,null);
    state.legacyPrepare = false;
    state.interrupt = true;
    service = setup();
    await assert.rejects(call('collabAddMember',originalInvitation),/素材保存到云端失败/);
    assert.equal(state.pending.requestId,firstId);
    assert.equal(state.uploaded.size,1);
    assert.equal(state.committed,null);
    const retained = await call('collabListMedia',{projectId});
    assert.equal(retained.length,4);
    assert.equal((await call('collabGetProject',{projectId})).storageMode,'local');
    for (const row of retained) assert.ok(fs.existsSync(row.filePath),'managed local media retained after failed share');
    state.interrupt = false;
    service = setup();
    const replacement = {projectId,username:'fixture_second',role:'artist_collaborator'};
    const completed = await call('collabAddMember',replacement);
    assert.notEqual(state.pending.requestId,firstId);
    assert.equal(completed.username,replacement.username);
    assert.equal(completed.role,replacement.role);
    assert.equal((await call('collabGetProject',{projectId})).storageMode,'cloud');
    const snapshot = state.committed;
    assert.equal(snapshot.project.director_project_id,localDirector);
    assert.deepEqual(snapshot.invitation,{username:replacement.username,role:replacement.role});
    assert.equal(snapshot.assets[0].adoptedImageId,photo.id);
    const rows = new Map(snapshot.media.map(row=>[row.id,row]));
    assert.equal(rows.size,4);
    const verifyReference = row => assert.equal(row.objectKey,rows.get(row.mediaId).objectKey);
    verifyReference(snapshot.project.analysis_progress._sharedVoiceProfiles.role.confirmed);
    snapshot.project.episodes[0].storyboardPrompts[0].generationConfig.references.forEach(verifyReference);
    for (const row of rows.values()) {
      assert.equal(state.uploaded.get(row.objectKey),'isolated '+row.filename);
      assert.equal(row.filePath,undefined);
      assert.equal(row.localPath,undefined);
    }
    assert.equal(state.requests.filter(entry=>entry.action==='project-local-share').length,1);
    for (const row of retained) assert.ok(fs.existsSync(row.filePath),'managed local media retained after share');
    return {bridge:true,uploads:state.uploaded.size,media:rows.size,legacyRetry:true,interruptedRetry:true,replacement:true,paidRequests:0};
  } finally {
    window?.destroy();
    for (const channel of handlers.keys()) ipcMain.removeHandler(channel);
    if (server.listening) {
      const closing = once(server,'close');
      server.close();
      server.closeAllConnections();
      await closing;
    }
  }
}

if (process.versions.electron) {
  if (!root || !path.isAbsolute(root)) throw Error('Start the smoke fixture with Node');
  app.setPath('userData', root);
  const deadline = setTimeout(() => {
    console.error('Local share Electron smoke timed out');
    app.exit(1);
  }, 30000);
  app.whenReady().then(verify).then(
    evidence => {console.log(JSON.stringify(evidence)); finish(0);},
    error => {console.error(error); finish(1);},
  );
  function finish(code) {
    clearTimeout(deadline);
    app.exit(code);
  }
} else {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(),'xz-share-smoke-'));
  try {
    const {ELECTRON_RUN_AS_NODE, ...env} = process.env;
    const run = spawnSync(electron,[__filename],{stdio:'inherit',windowsHide:true,timeout:40000,
      env:{...env,XINGZHOU_LOCAL_SHARE_SMOKE_ROOT:scratch}});
    if (run.error) throw run.error;
    process.exitCode = run.status ?? 1;
  } finally {
    fs.rmSync(scratch,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
}
