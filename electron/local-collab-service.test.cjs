const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLocalCollabService } = require('./local-collab-service.cjs');

function fixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-local-project-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let account = { id: 'owner', username: 'owner', isProducer: true };
  const calls = [];
  const cloud = new Proxy(overrides, {
    get(target, name) {
      return async (...args) => {
        calls.push(name);
        if (target[name]) return target[name](...args);
        throw Error('cloud unavailable');
      };
    },
  });
  const setup = () => createLocalCollabService({
    cloud,
    getSession: () => ({ account, token: 'device-session' }),
    getDirectory: () => directory,
    mediaFor: () => ({
      materialize: structuredClone,
      capture: async bundle => bundle,
      prepareShare: async bundle => bundle,
      storeFile: async file => ({ ...file, localPath: 'media/reference.wav' }),
      resolveReferences: refs => refs,
    }),
  });
  return { setup, calls, switchAccount: id => { account = { ...account, id }; } };
}

const source = { name: '单人制作', episodes: [{ id: 'e1', title: '第一集', prompts: [{ id: 's1', label: '1-1-1', content: '原稿' }] }] };

test('local reference-image preference survives restart and protects the adopted image of another look', async (t) => {
  const f = fixture(t), service = f.setup();
  const {id: projectId} = await service.createProject(source);
  const empty = await service.createAsset({projectId, name:'张三（便装）'});
  const drawn = await service.createAsset({projectId, name:'张三（制服）'});
  const image = await service.attachAssetImage({projectId, assetId:drawn.id, filePath:'uniform.png'});
  const set = (target, assetIds, noReferenceImage) => target.setAssetReferenceImagePreference({projectId, assetIds, noReferenceImage});
  assert.deepEqual(await set(service, [drawn.id, empty.id, empty.id], true), {updatedIds:[empty.id], skippedIds:[drawn.id]});
  const reopened = f.setup();
  let assets = await reopened.listAssets({projectId});
  assert.equal(assets.find(asset => asset.id === empty.id).noReferenceImage, true);
  assert.equal(assets.find(asset => asset.id === drawn.id).adoptedImageId, image.id);
  assert.notEqual(assets.find(asset => asset.id === drawn.id).noReferenceImage, true);
  await set(reopened, [empty.id], false);
  assert.equal((await f.setup().listAssets({projectId})).find(asset => asset.id === empty.id).noReferenceImage, false);
  await set(reopened, [empty.id], true);
  await reopened.attachAssetImage({projectId, assetId:empty.id, filePath:'casual.png'});
  assets = await f.setup().listAssets({projectId});
  assert.equal(assets.find(asset => asset.id === empty.id).noReferenceImage, false);
  assert.equal(assets.find(asset => asset.id === drawn.id).adoptedImageId, image.id);
  assert.deepEqual(f.calls, []);
});

test('local presence reads one record at startup and never scans it again during rapid requests',async t=>{
 const f=fixture(t),writer=f.setup();
 const project=await writer.createProject(source);await writer.createProject(source);await writer.createProject(source);
 const service=f.setup(),disk=fs.promises.readFile;
 let reads=0;
 t.mock.method(fs.promises,'readFile',(...args)=>{if(/\.json$/.test(String(args[0])))reads++;return disk(...args);});
 assert.deepEqual(await Promise.all(Array.from({length:8},()=>service.hasLocalProjects())),Array(8).fill(true));
 assert.equal(reads,1);
 assert.equal(await service.hasLocalProjects(),true);
 assert.equal(reads,1);
 f.switchAccount('another');
 assert.equal(await service.isLocal(project.id),false);
 assert.equal(await service.hasLocalProjects(),false);
 await service.createProject(source);
 assert.equal(await service.hasLocalProjects(),true);
});

test('an existing first invitation can retry with the selected director cloud binding', async t => {
  const requests = [];
  const f = fixture(t, {
    prepareLocalShare: () => ({revision:'reserved'}),
    commitLocalShare: p => {
      requests.push(p);
      if (!p.directorCloudProjectId) throw Object.assign(Error('source conflict'), {status:403});
      return {project:{...p.project,id:p.projectId},member:{id:'member',user_id:'other'}};
    },
  });
  const directorProjectId = '1795323477214-blxktuy';
  const directorCloudProjectId = '894d33cf-1faa-4113-8aed-9ad311462ca5';
  const project = await f.setup().createProject({...source,directorProjectId});
  const invite = {projectId:project.id,username:'other',role:'collaborator'};
  await assert.rejects(f.setup().addMember({...invite,directorSource:{id:'unrelated',cloudProjectId:directorCloudProjectId}}), /source conflict/);
  await f.setup().addMember({...invite,directorSource:{id:directorProjectId,cloudProjectId:directorCloudProjectId}});
  assert.equal(requests[1].requestId, requests[0].requestId);
  assert.equal(requests[1].directorCloudProjectId, directorCloudProjectId);
  assert.equal(requests[1].project.director_project_id, directorProjectId);
});

test('local prompt associations survive restart and enter the invitation snapshot',async t=>{
 let shared;
 const f=fixture(t,{prepareLocalShare:()=>({revision:'reserved'}),commitLocalShare:p=>{
  shared=p.project;return {project:{...p.project,id:p.projectId,myRole:'producer'},member:{id:'member',user_id:'other'}};
 }}),service=f.setup(),project=await service.createProject(source);
 const data={enabled:true,snapshot:{projectId:project.id,cards:[],entries:[]},decisions:{s1:{confirmed:true}}};
 await service.savePromptBinding({projectId:project.id,baseRevision:0,writeId:'first',data});
 assert.equal(f.calls.length,0);
 assert.equal((await f.setup().getProject({projectId:project.id})).analysis_progress._sharedPromptBinding.revision,1);
 await f.setup().addMember({projectId:project.id,username:'other',role:'collaborator'});
 assert.equal(shared.analysis_progress._sharedPromptBinding.decisions.s1.confirmed,true);
});

test('single-user project survives restart and saves actual storyboard while cloud is unavailable', async t => {
  const f = fixture(t);
  const project = await f.setup().createProject(source);
  const service = f.setup();
  const saved = await service.patchStoryboard({ projectId: project.id, episodeId: 'e1', shotId: 's1', editPolicy: 'direct', updates: { content: '本机修改' } });
  assert.equal(saved.episodes[0].storyboardPrompts[0].content, '本机修改');
  assert.equal((await service.getProject({ projectId: project.id })).storageMode, 'local');
  assert.equal((await service.listProjects())[0].id, project.id);
  assert.deepEqual(f.calls, []);
  f.switchAccount('other');
  assert.equal(await service.isLocal(project.id), false);
  await assert.rejects(service.getProject({ projectId: project.id }));
});

test('local storyboard saves precise timing and protects manual duration after service restart', async t => {
  const f=fixture(t), service=f.setup(), project=await service.createProject(source), projectId=project.id;
  const target={projectId,episodeId:'e1',shotId:'s1',editPolicy:'direct'};
  const durationEstimate={version:'2.0.0',status:'estimated',maxDurationSeconds:30,naturalSeconds:17,recommendedSeconds:17,
    needsResegment:false,capacityStatus:'正常',breakdown:{speechSeconds:7,nonparallelActionSeconds:8.8,pauseBufferSeconds:0.9},reason:'台词发声后独立动作，留出收尾。'};
  await service.patchStoryboard({...target,base:{content:'原稿'},updates:{durationEstimate,generationConfig:{duration:12,durationMode:'uniform',durationManuallyAdjusted:true,model:'old'}}});
  const reopened=f.setup(), ready=await reopened.getProject({projectId});
  assert.deepEqual(ready.episodes[0].storyboardPrompts[0].durationEstimate,durationEstimate);
  const settings={projectId,operation:'settings',scope:'episode',episodeId:'e1',revision:'r',durationMode:'recommended',
    supportedDurations:[5,15,20,30],settings:{profileId:'p',model:'v',ratio:'16:9',resolution:'720p'}};
  const kept=await reopened.patchStoryboard(settings);
  const retained={duration:12,durationMode:'uniform',durationManuallyAdjusted:true,...settings.settings,libtvMode:'auto',libtvParams:{},storyboardDefaultsRevision:'r'};
  assert.deepEqual(kept.episodes[0].storyboardPrompts[0].generationConfig,retained);
  assert.deepEqual((await f.setup().getProject({projectId})).episodes[0].storyboardPrompts[0].generationConfig,retained);
  const updated=await reopened.patchStoryboard({...settings,revision:'reset',includeManualDuration:true});
  assert.equal(updated.episodes[0].storyboardPrompts[0].generationConfig.duration,20);
  assert.equal(updated.episodes[0].storyboardPrompts[0].generationConfig.durationManuallyAdjusted,undefined);
  await reopened.patchStoryboard({...target,updates:{content:'改稿'}});
  const dirty=await f.setup().getProject({projectId});
  assert.equal(dirty.episodes[0].storyboardPrompts[0].durationEstimate.status,'needs-review');
  assert.equal(dirty.episodes[0].prompts[0].content,'原稿');
  assert.deepEqual(f.calls,[]);
});

test('sole-owner cloud snapshot becomes local while shared project continues using cloud', async t => {
  const { randomUUID } = require('node:crypto');
  const solo = randomUUID(), shared = randomUUID();
  const f = fixture(t, {
    getProject: ({projectId}) => ({...source,id:projectId,myRole:'producer',owner_id:'owner',updated_at:'v1'}),
    localProjectState: ({projectId}) => {
      if (projectId === shared) throw Object.assign(Error('shared'), {status:409});
      return {revision:'r1',updatedAt:'v1'};
    },
    listAssets: () => [], listMedia: () => [], listMessages: () => [], listTasks: () => [],
  });
  const service = f.setup();
  await service.getProject({projectId:solo});
  await service.waitForLocalPreparation(solo);
  assert.equal(await service.isLocal(solo),true);
  await service.getProject({projectId:shared});
  await service.waitForLocalPreparation(shared);
  assert.equal(await service.isLocal(shared),false);
  const count=f.calls.length;
  assert.equal((await service.getProject({projectId:solo})).storageMode,'local');
  assert.equal(f.calls.length,count);
});

test('invitation transfers snapshot once and reconciles lost commit acknowledgement using same request', async t => {
  const requests=[];
  let completed;
  const f=fixture(t,{
    prepareLocalShare: () => ({revision:'reserved',...(completed ? {completed} : {})}),
    commitLocalShare: p => {
      requests.push(p);
      completed={project:{...p.project,id:p.projectId,myRole:'producer'},member:{id:'member',user_id:'other'}};
      throw Error('connection reset after commit');
    },
  });
  const service=f.setup(), project=await service.createProject(source);
  const invitation={projectId:project.id,username:'other',role:'collaborator'};
  await assert.rejects(service.addMember(invitation), /connection reset/);
  assert.equal(await service.isLocal(project.id),true);
  const member=await f.setup().addMember(invitation);
  assert.equal(member.user_id,'other');
  assert.equal(await f.setup().isLocal(project.id),false);
  assert.equal(requests.length,1);
  assert.equal(requests[0].project.name,source.name);
});

for(const immediate of [true,false])test(`lost acknowledgement is recovered by read-only ${immediate?'verification':'project refresh'}`,async t=>{
 let completed,requestId,readable=immediate;
 const f=fixture(t,{
  prepareLocalShare:()=>({revision:'reserved'}),
  commitLocalShare:p=>{requestId=p.requestId;completed={project:{id:p.projectId,name:source.name,episodeCount:1},member:{id:'member',user_id:'other'}};throw Error('云端未确认本次保存');},
  readLocalShareReceipt:p=>{assert.equal(p.requestId,requestId);assert.equal(p.invitation.username,'other');return {completed:readable?completed:null};},
  getProject:p=>({...source,id:p.projectId,myRole:'producer'}),
 }),service=f.setup(),project=await service.createProject(source);
 const result=service.addMember({projectId:project.id,username:'other',role:'collaborator'});
 if(immediate)assert.equal((await result).id,'member');
 else{await assert.rejects(result,/未确认/);assert.equal(await service.isLocal(project.id),true);readable=true;assert.equal((await f.setup().getProject({projectId:project.id,retryLocal:true})).storageMode,'cloud');}
 assert.equal(await service.isLocal(project.id),false);
 assert.equal(f.calls.filter(n=>n==='commitLocalShare').length,1);
});

test('owned snapshot stays immediately readable during media preparation without calling expensive cloud get',async t=>{
 const {randomUUID}=require('node:crypto');const id=randomUUID();let release;
 const project={...source,id,owner_id:'owner',myRole:'producer',updated_at:'v1'};
 const f=fixture(t,{localProjectState:()=>({revision:'r1',updatedAt:'v1',project}),listAssets:()=>new Promise(r=>release=r),listMedia:()=>[],listTasks:()=>[],listMessages:()=>[]});
 const service=f.setup();await service.getProject({projectId:id});while(!release)await new Promise(r=>setImmediate(r));
 assert.equal((await service.getProject({projectId:id})).id,id);assert.equal(f.calls.includes('getProject'),false);
 release([]);await service.waitForLocalPreparation(id);
});
test('a failed discovery can retry while the first error remains visible',async t=>{
 let attempts=0;const f=fixture(t,{listProjects:()=>{if(++attempts===1)throw Error('network unavailable');return [];}});
 const service=f.setup();await assert.rejects(service.listProjects(),/network unavailable/);assert.deepEqual(await service.listProjects(),[]);assert.equal(attempts,2);
});
test('two initial list callers await the same cloud index instead of flashing an empty project list',async t=>{
 let started,release,calls=0;
 const entered=new Promise(resolve=>started=resolve),received=new Promise(resolve=>release=resolve);
 const f=fixture(t,{listProjects:()=>{calls++;started();return received;}});
 const service=f.setup(),first=service.listProjects();
 await entered;const second=service.listProjects();
 await new Promise(resolve=>setTimeout(resolve,20));
 release([{id:'remote-project',updated_at:'2026-10-01T00:00:00Z'}]);
 assert.deepEqual((await first).map(row=>row.id),['remote-project']);
 assert.deepEqual((await second).map(row=>row.id),['remote-project']);
 assert.equal(calls,1);
});
