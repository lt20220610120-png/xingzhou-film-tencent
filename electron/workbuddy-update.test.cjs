const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const modulePath = './workbuddy-update.cjs';
const api = () => { try { return require(modulePath); } catch (error) { if (error.code === 'MODULE_NOT_FOUND') return {}; throw error; } };
const tag = 'v1.0.78';
const privateConfig = JSON.stringify({auth_dir:'./auths',state_file:'./data/state.json',api_key:'private-config'});
const archive = Buffer.alloc(20, 7);
const release = (version = tag) => ({ tag_name: version, draft: false, prerelease: false, html_url: `https://github.com/ithtelab/workbuddy-manager/releases/tag/${version}`, published_at: '2026-10-01T05:38:01Z', assets: [{ name: `workbuddy-manager-${version}.tar.gz`, browser_download_url: `https://github.com/ithtelab/workbuddy-manager/releases/download/${version}/workbuddy-manager-${version}.tar.gz`, size: archive.length, digest: `sha256:${crypto.createHash('sha256').update(archive).digest('hex')}` }] });
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(),'xz-workbuddy-update-'));
  const root = path.join(base,'manager'); fs.mkdirSync(root);
  for (const [rel,content] of Object.entries({'server/main.py':'old server','server/requirements.txt':'','web/out/index.html':'old ui','deploy/update.py':'old deploy','.version':'v1.0.75','.env':'private-env','data/account.db':'private-account','upstream/auths/abc.json':'private-auth','upstream/config.json':privateConfig,'upstream/wb2api.exe':'old engine','.venv/Scripts/python.exe':'python'})) { const file = path.join(root,rel); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,content); }
  t.after(() => {
    const backups = path.join(base, 'protected-backups');
    if (fs.existsSync(backups)) {
      const makeWritable = directory => {
        for (const item of fs.readdirSync(directory, {withFileTypes:true})) {
          const file = path.join(directory,item.name);
          fs.chmodSync(file,item.isDirectory()?0o700:0o600);
          if (item.isDirectory()) makeWritable(file);
        }
      };
      for (const name of fs.readdirSync(backups)) require('./workbuddy-backup.cjs').protectFolder(path.join(backups,name),false);
      makeWritable(backups);
    }
    fs.rmSync(base,{recursive:true,force:true});
  }); return {base,root};
}
function fakeExtractor({destination,version}) { const stage = path.join(destination,`workbuddy-manager-v${version}`); for(const [rel,data] of Object.entries({'server/main.py':'new server','server/requirements.txt':'','web/out/index.html':'new ui','deploy/update.py':'new deploy','.version':`v${version}`,'data/account.db':'malicious replacement','upstream/wb2api.exe':'new engine'})) { const file = path.join(stage,rel); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,data); } return stage; }
function dependencies(extras = {}) { return { fetch:async url => new Response(url.endsWith('releases/latest') ? JSON.stringify(release()) : archive), extract:fakeExtractor, prepareEnvironment:async()=>{}, inspectData:root=>api().inspectPersistentPaths(root,{python:'python'}), backup:(root, paths)=>require('./workbuddy-backup.cjs').createBackup(root, paths, path.join(root, '..', 'protected-backups')), ...extras }; }
test('only official release assets with a canonical version, SHA-256 digest and size are accepted',()=>{
  assert.equal(typeof api().validateRelease,'function');
  assert.equal(api().validateRelease(release()).version,'1.0.78');
  for (const changed of [{...release(),tag_name:'v1.0.78/../../x'}, {...release(),draft:true}, {...release(),prerelease:true}, {...release(),assets:[]}, {...release(),assets:[...release().assets,...release().assets]}]) assert.throws(()=>api().validateRelease(changed));
  const wrong = release(); wrong.assets[0].browser_download_url = 'https://example.org/same.tar.gz'; assert.throws(()=>api().validateRelease(wrong));
  for (const digest of [null, '', 'sha256:1234', 'md5:' + 'f'.repeat(64)]) {
    const invalid = release(); invalid.assets[0].digest = digest;
    assert.throws(() => api().validateRelease(invalid));
  }
});
test('check returns public metadata without reading account or environment secrets',async t=>{
  assert.equal(typeof api().createWorkBuddyUpdater,'function'); const {root}=fixture(t);
  const updater=api().createWorkBuddyUpdater({getRoot:async()=>root},dependencies()); const metadata=await updater.check();
  assert.deepEqual(metadata,{currentVersion:'1.0.75',latestVersion:'1.0.78',available:true,releaseUrl:release().html_url,publishedAt:release().published_at});
  assert.doesNotMatch(JSON.stringify(metadata),/private|api_key|password/);
});
test('digest or archive-size failure never stops the running manager',async t=>{
  assert.equal(typeof api().createWorkBuddyUpdater,'function'); const {root}=fixture(t); let stops=0;
  for (const [download, message] of [[Buffer.alloc(archive.length, 6), /SHA-256/], ['too short', /大小/]]) {
    const deps = dependencies({fetch:async url=>new Response(url.endsWith('releases/latest') ? JSON.stringify(release()) : download)});
    const updater=api().createWorkBuddyUpdater({getRoot:()=>root,stop:async()=>{stops++;},start:async()=>{}},deps); await assert.rejects(()=>updater.update(), message);
  }
  assert.equal(stops,0); assert.equal(fs.readFileSync(path.join(root,'.version'),'utf8'),'v1.0.75');
});
test('asset redirects are validated before the updater contacts the next host', async t => {
  const { root } = fixture(t);
  const contacted = [];
  const updater = api().createWorkBuddyUpdater({ getRoot: () => root, stop: async () => {}, start: async () => {} }, dependencies({
    fetch: async (url, options) => {
      contacted.push(url);
      assert.equal(options.redirect, 'manual');
      if (url.endsWith('releases/latest')) return new Response(JSON.stringify(release()));
      return Response.redirect('https://untrusted.invalid/replacement');
    },
  }));
  await assert.rejects(updater.update(), /重定向来源/);
  assert.equal(contacted.length, 2);
});
test('the updater retries a transient GitHub connection failure with a fresh request signal', async t => {
  const {root} = fixture(t);
  const signals = [];
  const updater = api().createWorkBuddyUpdater({getRoot:()=>root}, dependencies({
    fetch:async (_url, options)=>{
      signals.push(options.signal);
      if(signals.length===1) throw Error('temporary connection failure');
      return new Response(JSON.stringify(release()));
    },
  }));
  assert.equal((await updater.check()).latestVersion,'1.0.78');
  assert.equal(signals.length,2);
  assert.notEqual(signals[0],signals[1]);
});
test('manager update preserves accounts, config and Go engine while replacing only code and environment',async t=>{
  assert.equal(typeof api().createWorkBuddyUpdater,'function'); const {root}=fixture(t); const events=[];
  const updater=api().createWorkBuddyUpdater({getRoot:()=>root,stop:async r=>{assert.equal(r,root);events.push('stop');},start:async()=>{events.push('start');return {running:true};},onProgress:s=>events.push(s.phase)},dependencies());
  const result=await updater.update(); assert.equal(result.ok,true); assert.equal(result.currentVersion,'1.0.78');
  assert.equal(fs.readFileSync(path.join(root,'server/main.py'),'utf8'),'new server');
  for(const [rel,content] of Object.entries({'.env':'private-env','data/account.db':'private-account','upstream/auths/abc.json':'private-auth','upstream/config.json':privateConfig,'upstream/wb2api.exe':'old engine'})) assert.equal(fs.readFileSync(path.join(root,rel),'utf8'),content);
  assert.ok(events.indexOf('verified') < events.indexOf('stop')); assert.ok(events.indexOf('stop') < events.indexOf('start'));
  assert.ok(path.isAbsolute(result.backupDirectory));
  assert.equal(fs.readFileSync(path.join(result.backupDirectory,'installation/.env'),'utf8'),'private-env');
  assert.equal(fs.readFileSync(path.join(result.backupDirectory,'installation/upstream/auths/abc.json'),'utf8'),'private-auth');
});
test('unable to make an independent backup never stops the installed service', async t => {
  const {root} = fixture(t); let stops = 0;
  const updater = api().createWorkBuddyUpdater({getRoot:()=>root, stop:async()=>{stops++;}, start:async()=>({running:true})},
    dependencies({backup:()=>{throw Error('fixture copy refusal');}}));
  await assert.rejects(updater.update(), /备份/);
  assert.equal(stops, 0);
  assert.equal(fs.readFileSync(path.join(root,'.version'),'utf8'),'v1.0.75');
});

test('a failed candidate startup restores manager database bytes captured after the old service stops', async t => {
  const {root} = fixture(t); let starts = 0;
  const db = path.join(root, 'data/manager.db');
  assert.equal(spawnSync('python', ['-c', 'import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute("PRAGMA user_version=42");c.close()', db]).status, 0);
  const before = fs.readFileSync(db);
  const updater = api().createWorkBuddyUpdater({getRoot:()=>root, stop:async()=>{}, start:async()=>{
    if (++starts === 1) {
      fs.writeFileSync(db, 'candidate database');
      throw Error('unhealthy');
    }
    assert.deepEqual(fs.readFileSync(db), before);
    return {running:true};
  }}, dependencies({ validateDatabase:async()=>{} }));
  await assert.rejects(updater.update(), /已回滚/);
  assert.equal(starts, 2);
});
test('failed health restart restores old code and environment then restarts the original manager',async t=>{
  assert.equal(typeof api().createWorkBuddyUpdater,'function'); const {root}=fixture(t); let starts=0; let stops=0;
  const updater=api().createWorkBuddyUpdater({getRoot:()=>root,stop:async()=>{stops++;},start:async()=>{if(++starts===1)throw new Error('unhealthy');return {running:true};}},dependencies({prepareEnvironment:async({venv})=>fs.writeFileSync(path.join(venv,'Scripts/python.exe'),'candidate python')}));
  await assert.rejects(()=>updater.update(),/已回滚/); assert.equal(starts,2); assert.equal(stops,2);
  assert.equal(fs.readFileSync(path.join(root,'server/main.py'),'utf8'),'old server'); assert.equal(fs.readFileSync(path.join(root,'.venv/Scripts/python.exe'),'utf8'),'python');
  assert.equal(fs.readFileSync(path.join(root,'.version'),'utf8'),'v1.0.75'); assert.equal(fs.readFileSync(path.join(root,'data/account.db'),'utf8'),'private-account');
});
test('archive extraction rejects traversal, Windows alternate streams and symbolic links before writing',t=>{
  const helper=path.join(__dirname,'workbuddy-archive.py'); assert.equal(fs.existsSync(helper),true); const {base}=fixture(t);
  const generator="import tarfile,io,sys; p,n,k=sys.argv[1:]; t=tarfile.open(p,'w:gz'); m=tarfile.TarInfo(n); m.size=1; m.type=tarfile.SYMTYPE if k=='link' else tarfile.REGTYPE; m.linkname='/tmp/outside'; t.addfile(m,io.BytesIO(b'x') if k!='link' else None); t.close()";
  for(const [i,[name,type]] of [['workbuddy-manager-v1.0.78/../../escaped','file'],['workbuddy-manager-v1.0.78/file:stream','file'],['workbuddy-manager-v1.0.78/link','link']].entries()) {
    const archive=path.join(base,`bad-${i}.tar.gz`); const dest=path.join(base,`stage-${i}`);
    assert.equal(spawnSync('python',['-c',generator,archive,name,type],{windowsHide:true}).status,0);
    const run=spawnSync('python',[helper,archive,dest,'1.0.78'],{encoding:'utf8',windowsHide:true}); assert.notEqual(run.status,0); assert.equal(fs.existsSync(path.join(base,'escaped')),false);
  }
});
test('a concurrent deployment selection cannot change the updater target',async t=>{
  const first=fixture(t),second=fixture(t); let reads=0; const stopped=[];
  const updater=api().createWorkBuddyUpdater({getRoot:()=>++reads===1?first.root:second.root,stop:async r=>stopped.push(r),start:async()=>({running:true})},dependencies());
  await updater.update();assert.equal(reads,1);assert.deepEqual(stopped,[first.root]);
  assert.equal(fs.readFileSync(path.join(second.root,'.version'),'utf8'),'v1.0.75');
});
test('an interrupted code move restores the directory before any service restart',async t=>{
  const {root}=fixture(t);let failed=false,stops=0,starts=0;
  const updater=api().createWorkBuddyUpdater({getRoot:()=>root,stop:async()=>{stops++;assert.equal(fs.existsSync(path.join(root,'server/main.py')),true);},start:async()=>{starts++;assert.equal(fs.readFileSync(path.join(root,'server/main.py'),'utf8'),'old server');return {running:true};}},dependencies({move:(from,to)=>{if(!failed&&from.includes(`${path.sep}extracted${path.sep}`)&&from.endsWith(`${path.sep}server`)){failed=true;throw new Error('move failed');}fs.renameSync(from,to);}}));
  await assert.rejects(()=>updater.update(),/已回滚/);assert.equal(stops,1);assert.equal(starts,1);
  assert.equal(fs.readFileSync(path.join(root,'.version'),'utf8'),'v1.0.75');
});
test('custom persistent environment paths inside replaced code are rejected before prepare or stop',async t=>{
  assert.equal(typeof api().inspectPersistentPaths,'function');
  for(const key of ['WB_DATA_DIR','WB_DB','WB_USERS_FILE','WB_AUTH_DIR','WB_UPSTREAM_DIR','WB_UPSTREAM_CONFIG','WB_CLIENT_PATHS_FILE','WB_CCSWITCH_DIR','WB_ZCODE_DIR','WB2API_LOG_FILE','WB2A_AUTH_DIR','WB2A_STATE_FILE','WB2A_DEVICE_TOKEN_FILE']) {
    const {root}=fixture(t);fs.writeFileSync(path.join(root,'.env'),`${key}=${key.startsWith('WB2A_')?'../':''}server/private-data\nSECRET=do-not-output\n`);let stops=0,prepares=0;
    const updater=api().createWorkBuddyUpdater({getRoot:()=>root,stop:async()=>stops++,start:async()=>({running:true})},dependencies({prepareEnvironment:async()=>prepares++}));
    await assert.rejects(()=>updater.update(),e=>e.message.includes(key)&&!e.message.includes('do-not-output'));
    assert.equal(stops,0);assert.equal(prepares,0);assert.equal(fs.readFileSync(path.join(root,'server/main.py'),'utf8'),'old server');
  }
});
test('Go state, device credentials and custom prompts inside code are also preserved by refusal',async t=>{
  for(const config of [{auth_dir:'../server/private-auth'}, {state_file:'../deploy/state.json'}, {upstream:{device_token_file:'../.venv/credentials'}}, {prompt:{file:'../web/out/my-prompt.md'}}]) {
    const {root}=fixture(t);fs.writeFileSync(path.join(root,'upstream/config.json'),JSON.stringify({...JSON.parse(privateConfig),...config}));let stops=0;
    const updater=api().createWorkBuddyUpdater({getRoot:()=>root,stop:async()=>stops++,start:async()=>({running:true})},dependencies());await assert.rejects(()=>updater.update(),/迁移.*资料|资料.*迁移/);assert.equal(stops,0);
  }
});
test('SQLite group auth directories are read only and conflicting groups prevent update',async t=>{
  const {root}=fixture(t),db=path.join(root,'data/manager.db');
  const setup=spawnSync('python',['-c','import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute("CREATE TABLE upstreams (auth_dir TEXT, api_key TEXT)");c.execute("INSERT INTO upstreams VALUES (?,?)",(sys.argv[2],"secret-key"));c.commit();c.close()',db,path.join(root,'server/group-auth')],{windowsHide:true});assert.equal(setup.status,0);
  const digest=crypto.createHash('sha256').update(fs.readFileSync(db)).digest('hex');let stops=0;
  const updater=api().createWorkBuddyUpdater({getRoot:()=>root,stop:async()=>stops++,start:async()=>({running:true})},dependencies());await assert.rejects(()=>updater.update(),/分组账号目录/);
  assert.equal(stops,0);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(db)).digest('hex'),digest);
});
test('malformed persistent configuration fails closed before stopping or preparing the manager',async t=>{
  const {root}=fixture(t);fs.writeFileSync(path.join(root,'upstream/config.json'),'not JSON');let stops=0,prepares=0;
  const updater=api().createWorkBuddyUpdater({getRoot:()=>root,stop:async()=>stops++,start:async()=>({running:true})},dependencies({prepareEnvironment:async()=>prepares++}));await assert.rejects(()=>updater.update(),/无法确认资料目录/);assert.equal(stops,0);assert.equal(prepares,0);
});
test('data configuration changed during download/preparation is rechecked before any stop',async t=>{
  const {root}=fixture(t);let stops=0,prepares=0;
  const updater=api().createWorkBuddyUpdater({getRoot:()=>root,stop:async()=>stops++,start:async()=>({running:true})},dependencies({prepareEnvironment:async()=>{prepares++;fs.writeFileSync(path.join(root,'.env'),'WB_AUTH_DIR=server/newly-selected-account-pool');}}));
  await assert.rejects(()=>updater.update(),/WB_AUTH_DIR/);assert.equal(prepares,1);assert.equal(stops,0);
  assert.equal(fs.readFileSync(path.join(root,'.version'),'utf8'),'v1.0.75');
});
test('a directory equal to replaced code is rejected with Windows case semantics',t=>{
  const {root}=fixture(t);const target=path.join(root,process.platform==='win32'?'SERVER':'server');
  assert.throws(()=>api().ensureDataOutsideCode(root,[{key:'WB_DATA_DIR',path:target}]),/WB_DATA_DIR/);
});
test('relative Go data uses the native service working directory when the config file is external',async t=>{
  const {root,base}=fixture(t);const config=path.join(base,'external-config.json');fs.writeFileSync(config,JSON.stringify({state_file:'../server/private-state'}));fs.writeFileSync(path.join(root,'.env'),`WB_UPSTREAM_CONFIG=${config.replaceAll('\\','/')}\n`);let stops=0;
  const updater=api().createWorkBuddyUpdater({getRoot:()=>root,stop:async()=>stops++,start:async()=>({running:true})},dependencies());await assert.rejects(()=>updater.update(),/state_file/);assert.equal(stops,0);
});
