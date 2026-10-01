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
const release = (version = tag) => ({ tag_name: version, html_url: `https://github.com/ithtelab/workbuddy-manager/releases/tag/${version}`, published_at: '2026-10-01T05:38:01Z', assets: ['tar.gz','tar.gz.sig'].map(ext => ({ name: `workbuddy-manager-${version}.${ext}`, browser_download_url: `https://github.com/ithtelab/workbuddy-manager/releases/download/${version}/workbuddy-manager-${version}.${ext}`, size: ext === 'tar.gz' ? 20 : 294 })) });
const sshString = data => { const b = Buffer.isBuffer(data) ? data : Buffer.from(data); const size = Buffer.alloc(4); size.writeUInt32BE(b.length); return Buffer.concat([size,b]); };
function signed(data, namespace = 'file') {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const raw = publicKey.export({type:'spki',format:'der'}).subarray(-32);
  const blob = Buffer.concat([sshString('ssh-ed25519'),sshString(raw)]);
  const message = Buffer.concat([Buffer.from('SSHSIG'),sshString(namespace),sshString(''),sshString('sha512'),sshString(crypto.createHash('sha512').update(data).digest())]);
  const sig = crypto.sign(null,message,privateKey);
  const version = Buffer.alloc(4); version.writeUInt32BE(1);
  const binary = Buffer.concat([Buffer.from('SSHSIG'),version,sshString(blob),sshString(namespace),sshString(''),sshString('sha512'),sshString(Buffer.concat([sshString('ssh-ed25519'),sshString(sig)]))]);
  return { armor:`-----BEGIN SSH SIGNATURE-----\n${binary.toString('base64')}\n-----END SSH SIGNATURE-----`, publicKey:`ssh-ed25519 ${blob.toString('base64')}` };
}
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(),'xz-workbuddy-update-'));
  const root = path.join(base,'manager'); fs.mkdirSync(root);
  for (const [rel,content] of Object.entries({'server/main.py':'old server','server/requirements.txt':'','web/out/index.html':'old ui','deploy/update.py':'old deploy','.version':'v1.0.75','.env':'private-env','data/account.db':'private-account','upstream/auths/abc.json':'private-auth','upstream/config.json':privateConfig,'upstream/wb2api.exe':'old engine','.venv/Scripts/python.exe':'python'})) { const file = path.join(root,rel); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,content); }
  t.after(()=>fs.rmSync(base,{recursive:true,force:true})); return {base,root};
}
function fakeExtractor({destination,version}) { const stage = path.join(destination,`workbuddy-manager-v${version}`); for(const [rel,data] of Object.entries({'server/main.py':'new server','server/requirements.txt':'','web/out/index.html':'new ui','deploy/update.py':'new deploy','.version':`v${version}`,'data/account.db':'malicious replacement','upstream/wb2api.exe':'new engine'})) { const file = path.join(stage,rel); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,data); } return stage; }
function dependencies(extras = {}) { return { fetch:async url => new Response(url.endsWith('releases/latest') ? JSON.stringify(release()) : Buffer.alloc(url.endsWith('.sig') ? 294 : 20,7)), verifySignature:()=>true, extract:fakeExtractor, prepareEnvironment:async()=>{}, inspectData:root=>api().inspectPersistentPaths(root,{python:'python'}), ...extras }; }
test('only signed assets from the official release with a canonical version are accepted',()=>{
  assert.equal(typeof api().validateRelease,'function');
  assert.equal(api().validateRelease(release()).version,'1.0.78');
  for (const changed of [{...release(),tag_name:'v1.0.78/../../x'}, {...release(),draft:true}, {...release(),prerelease:true}, {...release(),assets:release().assets.slice(0,1)}]) assert.throws(()=>api().validateRelease(changed));
  const wrong = release(); wrong.assets[0].browser_download_url = 'https://example.org/same.tar.gz'; assert.throws(()=>api().validateRelease(wrong));
});
test('SSHSIG verifies the pinned Ed25519 key, namespace and exact archive bytes',()=>{
  assert.equal(typeof api().verifyReleaseSignature,'function'); const archive=Buffer.from('release bytes'); const signature = signed(archive);
  assert.equal(api().verifyReleaseSignature(archive,signature.armor,signature.publicKey),true);
  assert.throws(()=>api().verifyReleaseSignature(Buffer.from('tampered'),signature.armor,signature.publicKey));
  assert.throws(()=>api().verifyReleaseSignature(archive,signature.armor));
  const wrongNamespace=signed(archive,'git'); assert.throws(()=>api().verifyReleaseSignature(archive,wrongNamespace.armor,wrongNamespace.publicKey));
});
test('check returns public metadata without reading account or environment secrets',async t=>{
  assert.equal(typeof api().createWorkBuddyUpdater,'function'); const {root}=fixture(t);
  const updater=api().createWorkBuddyUpdater({getRoot:async()=>root},dependencies()); const metadata=await updater.check();
  assert.deepEqual(metadata,{currentVersion:'1.0.75',latestVersion:'1.0.78',available:true,releaseUrl:release().html_url,publishedAt:release().published_at});
  assert.doesNotMatch(JSON.stringify(metadata),/private|api_key|password/);
});
test('signature or archive-size failure never stops the running manager',async t=>{
  assert.equal(typeof api().createWorkBuddyUpdater,'function'); const {root}=fixture(t); let stops=0;
  for(const deps of [dependencies({verifySignature:()=>{throw new Error('bad signature');}}),dependencies({fetch:async url=>new Response(url.endsWith('releases/latest') ? JSON.stringify(release()) : 'too short')})]) {
    const updater=api().createWorkBuddyUpdater({getRoot:()=>root,stop:async()=>{stops++;},start:async()=>{}},deps); await assert.rejects(()=>updater.update());
  }
  assert.equal(stops,0); assert.equal(fs.readFileSync(path.join(root,'.version'),'utf8'),'v1.0.75');
});
test('manager update preserves accounts, config and Go engine while replacing only code and environment',async t=>{
  assert.equal(typeof api().createWorkBuddyUpdater,'function'); const {root}=fixture(t); const events=[];
  const updater=api().createWorkBuddyUpdater({getRoot:()=>root,stop:async r=>{assert.equal(r,root);events.push('stop');},start:async()=>{events.push('start');return {running:true};},onProgress:s=>events.push(s.phase)},dependencies());
  const result=await updater.update(); assert.equal(result.ok,true); assert.equal(result.currentVersion,'1.0.78');
  assert.equal(fs.readFileSync(path.join(root,'server/main.py'),'utf8'),'new server');
  for(const [rel,content] of Object.entries({'.env':'private-env','data/account.db':'private-account','upstream/auths/abc.json':'private-auth','upstream/config.json':privateConfig,'upstream/wb2api.exe':'old engine'})) assert.equal(fs.readFileSync(path.join(root,rel),'utf8'),content);
  assert.ok(events.indexOf('verified') < events.indexOf('stop')); assert.ok(events.indexOf('stop') < events.indexOf('start'));
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
