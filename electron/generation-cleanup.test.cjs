const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createGenerationJobs } = require('./generation-jobs.cjs');

function fixture(t, build) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-result-cleanup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'media');
  fs.mkdirSync(dir);
  const file = (name, text = 'downloaded media') => {
    const target = path.join(dir, name); fs.writeFileSync(target, text); return target;
  };
  const rows = build({ root, dir, file });
  fs.writeFileSync(path.join(dir, 'generation-jobs.json'), JSON.stringify(rows));
  return { root, dir, rows, jobs: createGenerationJobs(dir) };
}

test('clear permanently removes local records and every generated file, preserving exported copies', t => {
  const f = fixture(t, ({ root, file }) => {
    fs.writeFileSync(path.join(root, 'export.mp4'), 'saved copy');
    return [{ id: 'video', kind: 'video', status: 'success', filePath: file('video.mp4'), mediaId: 'cloud-copy' },
      { id: 'images', kind: 'image', status: 'success', files: [file('1.png'), file('2.png')] },
      { id: 'failed', kind: 'video', status: 'failed' }];
  });
  const result = f.jobs.clear({ ids: ['video', 'images', 'failed'] });
  assert.equal(result.removed, 3);
  assert.equal(result.filesDeleted, 3);
  assert.ok(result.bytesFreed > 0);
  assert.deepEqual(f.jobs.list(), []);
  assert.equal(fs.existsSync(path.join(f.root, 'export.mp4')), true);
  assert.equal(createGenerationJobs(f.dir).list().length, 0, 'must remain cleared after restart');
});

test('clear rejects active tasks before deleting any result', t => {
  for (const status of ['submitting', 'submitted', 'downloading']) {
    const f = fixture(t, ({ file }) => [{ id: 'done', status: 'success', filePath: file('done.mp4') }, { id: 'busy', status }]);
    assert.throws(() => f.jobs.clear({ ids: ['done', 'busy'] }), /完成|核对|清理/);
    assert.equal(fs.existsSync(f.rows[0].filePath), true);
    assert.equal(f.jobs.list().length, 2);
  }
});

test('clear preserves files still used by another task or a prompt draft', t => {
  const f = fixture(t, ({ file }) => {
    const shared = file('shared.mp4'), draft = file('draft.png');
    return [{ id: 'done', status: 'success', files: [shared, draft] },
      { id: 'other', status: 'submitted', references: [{ filePath: shared }] }];
  });
  const result = f.jobs.clear({ ids: ['done'], retainedPaths: [f.rows[0].files[1]] });
  assert.equal(result.removed, 1);
  assert.equal(result.filesDeleted, 0);
  assert.equal(result.filesRetained, 2);
  for (const file of f.rows[0].files) assert.equal(fs.existsSync(file), true);
});

test('clear never deletes an external file, folder or the job manifest', t => {
  const f = fixture(t, ({ root, dir }) => {
    const external = path.join(root, 'original.mp4'); fs.writeFileSync(external, 'original');
    return [{ id: 'done', status: 'success', files: [external, dir, path.join(dir, 'generation-jobs.json')] }];
  });
  f.jobs.clear({ ids: ['done'] });
  assert.equal(fs.existsSync(path.join(f.root, 'original.mp4')), true);
  assert.equal(fs.statSync(f.dir).isDirectory(), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.dir, 'generation-jobs.json'))), []);
});

test('clear tolerates already missing files and repeated requests', t => {
  const f = fixture(t, ({ dir }) => [{ id: 'done', status: 'success', filePath: path.join(dir, 'missing.mp4') }]);
  assert.equal(f.jobs.clear({ ids: ['done', 'done'] }).removed, 1);
  assert.equal(f.jobs.clear({ ids: ['done'] }).removed, 0);
});

test('clearing selected videos leaves image results and archived records alone', t => {
  const f = fixture(t, ({ file }) => [{ id: 'video', status: 'success', kind: 'video', filePath: file('v.mp4') },
    { id: 'image', status: 'success', kind: 'image', filePath: file('i.png') },
    { id: 'archived', status: 'success', archived: true, filePath: file('old.mp4') }]);
  f.jobs.clear({ ids: ['video'] });
  assert.deepEqual(f.jobs.list().map(j => j.id), ['image']);
  assert.equal(fs.existsSync(f.rows[1].filePath), true);
  assert.equal(fs.existsSync(f.rows[2].filePath), true);
});

test('file locking midway through cleanup restores every file and record', t => {
  const f = fixture(t, ({ file }) => [{ id: 'first', status: 'success', filePath: file('first.mp4') },
    { id: 'second', status: 'success', filePath: file('second.mp4') }]);
  const unlink = fs.unlinkSync;
  fs.unlinkSync = target => { if (target === f.rows[1].filePath) throw Object.assign(new Error('locked'), { code: 'EPERM' }); return unlink(target); };
  try { assert.throws(() => f.jobs.clear({ ids: ['first', 'second'] }), /清理失败/); }
  finally { fs.unlinkSync = unlink; }
  assert.deepEqual(f.jobs.list().map(job => job.id), ['first', 'second']);
  for (const row of f.rows) assert.equal(fs.readFileSync(row.filePath, 'utf8'), 'downloaded media');
});

test('a manifest write failure restores the original result files', t => {
  const f = fixture(t, ({ file }) => [{ id: 'done', status: 'success', filePath: file('done.mp4') }]);
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => { if (to === path.join(f.dir, 'generation-jobs.json')) throw new Error('manifest locked'); return rename(from, to); };
  try { assert.throws(() => f.jobs.clear({ ids: ['done'] }), /清理失败/); }
  finally { fs.renameSync = rename; }
  assert.equal(f.jobs.list().length, 1);
  assert.equal(fs.readFileSync(f.rows[0].filePath, 'utf8'), 'downloaded media');
});

test('generation managers follow the selected data directory and keep previous managers', t => {
  const { createGenerationManagers } = require('./generation-jobs.cjs');
  const a = fixture(t, () => [{ id: 'a', status: 'success' }]);
  const b = fixture(t, () => [{ id: 'b', status: 'success' }]);
  const manager = createGenerationManagers();
  const first = manager(a.dir);
  assert.deepEqual(manager(b.dir).list().map(job => job.id), ['b']);
  assert.equal(manager(a.dir), first);
  assert.deepEqual(first.list().map(job => job.id), ['a']);
});

test('cleanup supports data disks without hard links using a reversible local rename', t => {
  const f = fixture(t, ({ file }) => [{ id: 'done', status: 'success', filePath: file('done.mp4') }]);
  const link = fs.linkSync;
  fs.linkSync = () => { throw Object.assign(new Error('hard links unsupported'), { code: 'ENOTSUP' }); };
  try {
    const result = f.jobs.clear({ ids: ['done'] });
    assert.equal(result.filesDeleted, 1); assert.equal(result.removed, 1);
  } finally { fs.linkSync = link; }
  assert.deepEqual(f.jobs.list(), []);
  assert.deepEqual(fs.readdirSync(f.dir), ['generation-jobs.json']);
});

test('rename fallback restores originals if committing records fails', t => {
  const f = fixture(t, ({ file }) => [{ id: 'done', status: 'success', filePath: file('done.mp4') }]);
  const link = fs.linkSync, rename = fs.renameSync;
  fs.linkSync = () => { throw Object.assign(new Error('unsupported'), { code: 'ENOTSUP' }); };
  let commitAttempted = false;
  fs.renameSync = (from, to) => { if (to === path.join(f.dir, 'generation-jobs.json')) { commitAttempted = true; throw new Error('locked'); } return rename(from, to); };
  try { assert.throws(() => f.jobs.clear({ ids: ['done'] }), /清理失败/); }
  finally { fs.linkSync = link; fs.renameSync = rename; }
  assert.equal(commitAttempted, true);
  assert.equal(f.jobs.list().length, 1);
  assert.equal(fs.readFileSync(f.rows[0].filePath, 'utf8'), 'downloaded media');
});


test('clear removes pending-review results from view but keeps their original remote identity and files after restart', t => {
 const f=fixture(t,({file})=>[{id:'unknown',provider:'likeai',status:'uncertain',jobId:'remote-original',nodeId:'node-original',filePath:file('unknown.mp4')},{id:'failed',status:'failed'},{id:'live',status:'submitted'}]);
 const result=f.jobs.clear({ids:['unknown','failed']});
 assert.equal(result.removed,2);assert.equal(result.archived,1);
 assert.deepEqual(f.jobs.list().map(j=>j.id),['live']);
 const kept=JSON.parse(fs.readFileSync(path.join(f.dir,'generation-jobs.json'))).find(j=>j.id==='unknown');
 assert.equal(kept.archived,true);assert.equal(kept.status,'uncertain');assert.equal(kept.jobId,'remote-original');assert.equal(kept.nodeId,'node-original');
 assert.equal(fs.existsSync(kept.filePath),true);assert.deepEqual(createGenerationJobs(f.dir).list().map(j=>j.id),['live']);
 assert.equal(f.jobs.clear({ids:['unknown']}).removed,0);
});

test('a pending review query finishing after clear never resurrects a hidden card', async t=>{
 const f=fixture(t,()=>[{id:'pending',provider:'likeai',status:'uncertain',jobId:'remote-original'}]);
 let release,started;const ready=new Promise(resolve=>started=resolve);let queries=0;
 const jobs=createGenerationJobs(f.dir,{likeService:{query:async()=>{queries++;started();return await new Promise(resolve=>release=resolve);}}});
 const query=jobs.refresh({id:'pending'});await ready;
 assert.equal(jobs.clear({ids:['pending']}).removed,1);
 release({status:'submitted',taskId:'remote-original'});await query;
 assert.deepEqual(jobs.list(),[]);assert.equal(queries,1);
 const row=JSON.parse(fs.readFileSync(path.join(f.dir,'generation-jobs.json')))[0];assert.equal(row.archived,true);assert.equal(row.jobId,'remote-original');
});

test('explicit screen clear hides every active state but retains task identity and working files',t=>{
 const f=fixture(t,({file})=>['submitting','submitted','downloading','uncertain','success','failed'].map((status,i)=>({id:status,status,jobId:'remote-'+i,filePath:file(status+'.mp4')})));
 const result=f.jobs.clear({ids:f.rows.map(j=>j.id),includeActive:true});
 assert.equal(result.removed,6);assert.equal(result.archived,4);assert.equal(result.filesDeleted,2);
 assert.deepEqual(f.jobs.list(),[]);const all=f.jobs.list({includeArchived:true});assert.equal(all.length,4);
 for(const job of all){assert.equal(job.archived,true);assert.equal(job.jobId,f.rows.find(j=>j.id===job.id).jobId);assert.equal(fs.existsSync(job.filePath),true);}
 assert.deepEqual(createGenerationJobs(f.dir).list(),[]);assert.equal(f.jobs.clear({ids:f.rows.map(j=>j.id),includeActive:true}).removed,0);
});

test('hidden active task completes through the original query without reappearing or being resubmitted',async t=>{
 const f=fixture(t,()=>[{id:'pending',provider:'likeai',status:'submitted',jobId:'remote-original'}]);
 let release,started;const ready=new Promise(resolve=>started=resolve);let queries=0,submits=0;
 const jobs=createGenerationJobs(f.dir,{likeService:{submit:async()=>{submits++;throw Error('must not resubmit');},query:async()=>{queries++;started();return new Promise(resolve=>release=resolve);},download:async()=>({filePath:path.join(f.dir,'completed.mp4')})}});
 const query=jobs.refresh({id:'pending'});await ready;jobs.clear({ids:['pending'],includeActive:true});
 release({status:'success',taskId:'remote-original'});await query;
 assert.equal(submits,0);assert.equal(queries,1);assert.deepEqual(jobs.list(),[]);assert.equal(jobs.list({includeArchived:true})[0].status,'success');
 assert.equal(jobs.list({includeArchived:true})[0].archived,true);assert.equal(jobs.list({includeArchived:true})[0].jobId,'remote-original');
});

test('screen clear preserves a shared file still used by a hidden download',t=>{
 const f=fixture(t,({file})=>{const shared=file('working.mp4');return[{id:'done',status:'success',filePath:shared},{id:'download',status:'downloading',filePath:shared}];});
 const result=f.jobs.clear({ids:['done','download'],includeActive:true});assert.equal(result.filesDeleted,0);assert.equal(fs.existsSync(f.rows[0].filePath),true);assert.deepEqual(f.jobs.list(),[]);
});

test('a paid submission finishing after screen clear retains its hidden state without duplicate submission',async t=>{
 const f=fixture(t,()=>[]);let start,release,submits=0;const ready=new Promise(resolve=>start=resolve);
 const jobs=createGenerationJobs(f.dir,{likeService:{submit:async()=>{submits++;start();return new Promise(resolve=>release=resolve);}}});
 const pending=jobs.submit({kind:'video',provider:'likeai',endpoint:'https://like.example',prompt:'test'});await ready;const id=jobs.list()[0].id;jobs.clear({ids:[id],includeActive:true});
 release({status:'submitted',taskId:'original-paid-id'});await pending;
 assert.equal(submits,1);assert.deepEqual(jobs.list(),[]);assert.equal(jobs.list({includeArchived:true})[0].jobId,'original-paid-id');assert.equal(jobs.list({includeArchived:true})[0].clearedWhileActive,true);
});

test('clearing a prompt book after hiding active jobs keeps their imported references',async t=>{
 const {generationRetainedPaths}=require('./generation-jobs.cjs'),{deleteEpisodeMedia}=require('./episode-media-import.cjs');
 const f=fixture(t,({dir})=>{const imported=path.join(dir,'整本提示词素材');fs.mkdirSync(imported);const image=path.join(imported,'original.png');fs.writeFileSync(image,'original');return[{id:'active',status:'submitting',references:[{filePath:image}]}];});
 f.jobs.clear({ids:['active'],includeActive:true});assert.deepEqual(f.jobs.list(),[]);
 const removed=await deleteEpisodeMedia({destDir:f.dir,paths:[f.rows[0].references[0].filePath],retainedPaths:generationRetainedPaths(f.jobs.list({includeArchived:true}))});
 assert.equal(removed,0);assert.equal(fs.existsSync(f.rows[0].references[0].filePath),true);
});
