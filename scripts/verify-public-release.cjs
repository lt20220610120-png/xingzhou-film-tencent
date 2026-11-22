const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {setTimeout: pause} = require('node:timers/promises');

const owner = 'lt20220610120-png';
const releaseRepo = `${owner}/xingzhou-film-updates`;
const sourceRepo = `${owner}/xingzhou-film-tencent`;
const mirror = 'https://xingzhoufilm.cn/api/updates';
const installerVersion = file => {
  const match = /^Xingzhou-Film-Tencent-Setup-(\d+\.\d+\.\d+)\.exe$/.exec(path.basename(file || ''));
  if (!match) throw Error('请提供行舟影视正式 Windows 安装包');
  return match[1];
};

async function verifyPublic(file, scratch) {
  const {validateManifest} = require('../electron/update-trust.cjs');
  const {sha256File} = require('../electron/file-digest.cjs');
  const version = installerVersion(file);
  const digest = await sha256File(file);
  const size = fs.statSync(file).size;
  const name = path.basename(file);
  const url = `https://github.com/${releaseRepo}/releases/download/v${version}/${name}`;
  const curl = args => execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl',
    ['--fail','--silent','--show-error','--max-time','30',...args], {windowsHide:true});
  const channels = [`${mirror}/latest.json`,...[releaseRepo,sourceRepo].map(repo=>`https://raw.githubusercontent.com/${repo}/main/latest.json`)];
  for (const channel of channels) {
    const manifest = validateManifest(JSON.parse(curl([`${channel}?verify=${Date.now()}`]).toString('utf8')));
    assert.deepEqual({version:manifest.version, digest:manifest.sha256, size:manifest.size, url:manifest.installerUrl}, {version,digest,size,url}, channel);
  }
  const release = JSON.parse(execFileSync('gh',['api',`repos/${releaseRepo}/releases/tags/v${version}`],{windowsHide:true,encoding:'utf8'}));
  assert.equal(release.draft,false);
  const asset = release.assets.find(row=>row.name===name);
  assert.equal(asset?.digest,`sha256:${digest}`);
  assert.equal(asset?.size,size);

  const headers = path.join(scratch,'range.headers');
  const bytes = curl(['-D',headers,'-H','Range: bytes=0-65535',`${mirror}/${name}`]);
  assert.match(fs.readFileSync(headers,'utf8'),/HTTP\/\S+ 206\b/);
  const prefix = Buffer.alloc(65536);
  const input = fs.openSync(file,'r');
  try { assert.equal(fs.readSync(input,prefix,0,prefix.length,0),prefix.length); } finally { fs.closeSync(input); }
  assert.deepEqual(bytes,prefix);
  console.log(JSON.stringify({version,size,sha256:digest,releaseId:release.id,signedManifests:channels.length,mirrorRange:206}));
}

async function verifyOldUpdater(archive, file, profile) {
  const {app,BrowserWindow,ipcMain,net} = require('electron');
  const load = name => require(path.join(archive,'electron',name+'.cjs'));
  const {version:installed} = require(path.join(archive,'package.json'));
  const expected = installerVersion(file);
  const {registerUpdateHandlers} = load('update-ipc');
  const {TRUSTED_MANIFEST_URL,newerVersion} = load('update-trust');
  const {fetchUpdateManifest} = load('update-manifest');
  const {createUpdateFetch} = load('update-transport');
  const {downloadInstaller,safeName,verifyInstaller} = load('update-service');
  assert.ok(newerVersion(expected,installed));
  app.setPath('userData',profile);
  app.setPath('sessionData',profile);
  app.disableHardwareAcceleration();
  await app.whenReady();
  let checks = 0, attempts = 0, ranged = false, installVerified = false;
  const fetchFn = createUpdateFetch((url,options)=>net.fetch(url,options));
  ipcMain.handle('app-version',()=>installed);
  ipcMain.handle('app-access-stage',()=>true);
  ipcMain.handle('license-check',()=>({status:'inactive',allowed:false}));
  ipcMain.handle('license-remembered-card',()=>null);
  registerUpdateHandlers({ipcMain,getVersion:()=>installed,
    checkManifest:async()=>{
      checks++;
      const result = await fetchUpdateManifest(TRUSTED_MANIFEST_URL,{fetchFn,officialMirrors:[`${mirror}/latest.json`]});
      assert.equal(result.manifest.version,expected);
      return result;
    },
    download:async(manifest,onProgress)=>{
      const destinationDir = path.join(profile,'updates');
      const partial = path.join(destinationDir,`${safeName(expected)}.${manifest.sha256}.part`);
      const offset = manifest.size-65536;
      if (++attempts===1) {
        await verifyInstaller(file,manifest);
        fs.mkdirSync(destinationDir,{recursive:true});
        fs.copyFileSync(file,partial);
        fs.truncateSync(partial,offset);
        throw Error('隔离验证：连接暂时中断');
      }
      return downloadInstaller({...manifest,url:manifest.installerUrl,destinationDir,onProgress,attempts:1,idleMs:20000,
        fetchImpl:async(_url,options)=>{
          assert.equal(options.headers.Range,`bytes=${offset}-`);
          const response = await fetchFn(`${mirror}/${path.basename(file)}`,options);
          assert.equal(response.status,206);
          ranged = true;
          return response;
        }});
    },
    install:async(candidate,manifest)=>{
      await verifyInstaller(candidate,manifest);
      installVerified = true;
      return true;
    },
  });
  const win = new BrowserWindow({width:1200,height:900,show:false,webPreferences:{backgroundThrottling:false,preload:path.join(archive,'electron/preload.cjs')}});
  try {
    await win.loadFile(path.join(archive,'dist/index.html'));
    const run = expr=>win.webContents.executeJavaScript(expr);
    async function wait(expr) {
      for (let tries=0;tries<200;tries++) { if (await run(expr)) return; await pause(100); }
      throw Error(`更新界面超时 ${expr}`);
    }
    await wait(`document.querySelector('.startup-update-version')?.textContent.includes(${JSON.stringify(expected)})`);
    const action = "document.querySelector('.startup-update-actions .primary').click()";
    await run(action);
    await wait("document.querySelector('[role=alert]')?.textContent.includes('连接暂时中断')");
    await run(action);
    await wait("document.querySelector('.startup-update-actions .primary')?.textContent==='安装并重启'");
    await run(action);
    for (let tries=0;tries<100&&!installVerified;tries++) await pause(50);
    assert.deepEqual({checks,attempts,ranged,installVerified},{checks:1,attempts:2,ranged:true,installVerified:true});
    console.log(JSON.stringify({installed,expected,checks,attempts,ranged,installVerified}));
  } finally { win.destroy(); }
}

async function main() {
  const [file,previous] = process.argv.slice(2).map(name=>path.resolve(name));
  if (!file) throw Error('用法 node scripts/verify-public-release.cjs <当版安装包> [上版安装包]');
  const temp = fs.realpathSync(os.tmpdir());
  const scratch = fs.mkdtempSync(path.join(temp,'xz-public-release-'));
  try {
    await verifyPublic(file,scratch);
    if (!previous) return;
    installerVersion(previous);
    const defaultSevenZip = process.env.ProgramFiles && path.join(process.env.ProgramFiles,'7-Zip','7z.exe');
    const sevenZip = process.env.XINGZHOU_7ZIP || (defaultSevenZip && fs.existsSync(defaultSevenZip) ? defaultSevenZip : '7z');
    const extract = args => execFileSync(sevenZip,args,{windowsHide:true,timeout:90000});
    extract(['e','-y',`-o${scratch}`,previous,'$PLUGINSDIR/app-64.7z']);
    extract(['x','-y',`-o${scratch}`,path.join(scratch,'app-64.7z'),'resources/app.asar']);
    const profile = path.join(scratch,'profile');
    fs.mkdirSync(profile);
    execFileSync(require('electron'),[__filename,path.join(scratch,'resources/app.asar'),file,profile],{windowsHide:true,stdio:'inherit',timeout:90000});
  } finally {
    if (path.dirname(fs.realpathSync(scratch))===temp) await fs.promises.rm(scratch,{recursive:true,force:true,maxRetries:8,retryDelay:200});
  }
}

if (process.versions.electron) {
  const {app} = require('electron');
  verifyOldUpdater(...process.argv.slice(2)).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1);});
} else {
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
