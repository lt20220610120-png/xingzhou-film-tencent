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
