const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {createServer} = require('../src/server.cjs');

test('public downloads reject absent or empty files and still serve valid byte ranges',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'xz-updates-'));
  await fs.writeFile(path.join(directory,'latest.json'),'{}');
  const empty='Xingzhou-Film-Tencent-Setup-2.8.210.exe';
  const valid='Xingzhou-Film-Tencent-Setup-2.8.211.exe';
  await fs.writeFile(path.join(directory,empty),'');
  await fs.writeFile(path.join(directory,valid),'xyz');
  const server=createServer({API_SECRET:'fixture',DATABASE_URL:'postgres://fixture',UPDATE_FILES_DIR:directory},{repository:{},mailer:null,cosSigner:null});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true});});
  const get=(name,opts)=>fetch('http://127.0.0.1:'+server.address().port+'/api/updates/'+name,opts);
  assert.equal((await get(empty,{method:'HEAD'})).status,404);
  assert.equal((await get(empty)).status,404);
  assert.equal((await get('subdirectory/latest.json')).status,404);
  assert.equal((await get(valid,{headers:{Range:'bytes=4-'}})).status,416);
  const range=await get(valid,{headers:{Range:'bytes=1-2'}});
  assert.equal(range.status,206);
  assert.equal(await range.text(),'yz');
});
