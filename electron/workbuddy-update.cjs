const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const runFile = require('node:util').promisify(execFile);
const { isDeepStrictEqual } = require('node:util');
const { windowlessPython,windowlessPythonArgs } = require('./windows-process.cjs');
const { createBackup, accountInventory, protectFolder, checkpointDatabase, restoreDatabase } = require('./workbuddy-backup.cjs');

const REPOSITORY = 'ithtelab/workbuddy-manager';
const RELEASE_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const CODE_PATHS = ['server', 'web/out', 'deploy', '.version', '.venv'];
const MAX_ARCHIVE = 64 * 1024 * 1024;
class GitHubNetworkError extends Error {}

function versionOf(value) {
  const match = /^v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(String(value || '').trim());
  if (!match || match[1].split('.').some(n => !Number.isSafeInteger(Number(n)))) throw new Error('WorkBuddy 版本格式无效');
  return match[1];
}
function newer(a,b) {
  const left=a.split('.').map(Number), right=b.split('.').map(Number);
  for(let i=0;i<3;i++) { if(left[i]!==right[i]) return left[i]>right[i]; } return false;
}
function validateRelease(release) {
  if (!release || release.draft !== false || release.prerelease !== false || !Array.isArray(release.assets)) {
    throw new Error('未找到可安装的正式发布包');
  }
  const version = versionOf(release.tag_name), tag = `v${version}`;
  if (release.tag_name !== tag) throw new Error('WorkBuddy 发布标签无效');
  const releaseUrl = `https://github.com/${REPOSITORY}/releases/tag/${tag}`;
  if (release.html_url !== releaseUrl) throw new Error('WorkBuddy 发布来源不匹配');
  const name = `workbuddy-manager-${tag}.tar.gz`;
  const matches = release.assets.filter(asset => asset?.name === name);
  if (matches.length !== 1) throw new Error('正式发布包缺失或重复');
  const asset = matches[0];
  const url = `https://github.com/${REPOSITORY}/releases/download/${tag}/${name}`;
  if (asset.browser_download_url !== url || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > MAX_ARCHIVE) {
    throw new Error('WorkBuddy 发布文件信息无效');
  }
  const digest = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest || '');
  if (!digest) throw new Error('GitHub 未提供有效的 SHA-256 摘要，已拒绝安装');
  return { version, releaseUrl, publishedAt: typeof release.published_at === 'string' ? release.published_at : '', archive: { name, url, size: asset.size, sha256: digest[1].toLowerCase() } };
}

function within(root,target) { const relative=path.relative(root,target);return relative!==''&&!path.isAbsolute(relative)&&!relative.startsWith(`..${path.sep}`)&&relative!=='..'; }
function safePath(root,relative) {
  const target=path.resolve(root,relative);
  if(!within(root,target))throw new Error('WorkBuddy 更新路径越界');
  let current=root;
  for(const segment of path.relative(root,target).split(path.sep)) {
    current=path.join(current,segment);
    if(fs.lstatSync(current,{throwIfNoEntry:false})?.isSymbolicLink())throw new Error('WorkBuddy 更新路径包含链接，已拒绝安装');
  }
  return target;
}
function rejectLinks(root) {
  const walk=dir=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})) {const child=path.join(dir,item.name);if(item.isSymbolicLink())throw new Error('WorkBuddy 程序目录包含链接，已拒绝安装');if(item.isDirectory())walk(child);}};walk(root);
}
function validateRoot(root) {
  if(typeof root!=='string'||!path.isAbsolute(root)||!fs.existsSync(root)||fs.lstatSync(root).isSymbolicLink())throw new Error('请先选择本机 WorkBuddy 部署目录');
  const real=fs.realpathSync(root);
  for(const rel of ['server/main.py','web/out/index.html','.venv/Scripts/python.exe','.version'])if(!fs.statSync(safePath(real,rel),{throwIfNoEntry:false})?.isFile())throw new Error('WorkBuddy 部署目录缺少运行文件');
  for(const rel of CODE_PATHS)safePath(real,rel);
  return real;
}
function run(executable,args,{cwd,timeout=180000,environment=process.env}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(windowlessPython(executable),windowlessPythonArgs(args),{cwd,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe'],env:{...environment,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});
    let ended=false;const finish=error=>{if(ended)return;ended=true;clearTimeout(timer);error?reject(error):resolve();};
    // Consume child output without forwarding anything that might contain proxy
    // credentials or environment values to the renderer or application logs.
    child.stdout?.on('data',()=>{});child.stderr?.on('data',()=>{});
    const timer=setTimeout(()=>{child.kill();finish(new Error('候选环境准备超时'));},timeout);
    child.once('error',()=>finish(new Error('无法启动 WorkBuddy 候选环境')));
    child.once('exit',code=>finish(code===0?null:new Error(`候选环境准备失败（退出码 ${code ?? '未知'}）`)));
  });
}
async function prepareEnvironment({venv,stage}) {
  const python=path.join(venv,'Scripts','python.exe');
  await run(python,['-c','import os,sys; expected=os.path.normcase(os.path.realpath(sys.argv[1])); actual=os.path.normcase(os.path.realpath(sys.prefix)); assert actual==expected and sys.prefix!=sys.base_prefix, "candidate venv mismatch"',venv],{cwd:stage});
  await run(python,['-m','pip','install','--disable-pip-version-check','--no-input','--no-cache-dir','-r',path.join(stage,'server','requirements.txt')],{cwd:stage,timeout:600000});
  await run(python,['-m','compileall','-q',path.join(stage,'server')],{cwd:stage});
}
async function validateDatabase({ database, reference, staging, stage, venv }) {
  if (!database || !fs.existsSync(database)) return;
  const folder = safePath(staging, 'migration-test');
  fs.mkdirSync(folder, { mode: 0o700 });
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const source = reference(database + suffix);
    if (!source || !fs.existsSync(source)) continue;
    const target = path.join(folder, `manager.db${suffix}`);
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(target, 0o600);
  }
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:WB_|WB2|PYTHON)/i.test(name)));
  Object.assign(environment, { WB_DATA_DIR: folder, WB_DB: path.join(folder, 'manager.db'), PYTHONDONTWRITEBYTECODE: '1' });
  const preflight = [
    'import sqlite3, sys, os',
    'with sqlite3.connect(os.environ["WB_DB"]) as con:',
    '    assert con.execute("PRAGMA quick_check").fetchone() == ("ok",)',
    '    if con.execute("SELECT 1 FROM sqlite_master WHERE name=\'api_keys\' AND type=\'table\'").fetchone():',
    '        assert not con.execute("SELECT 1 FROM api_keys GROUP BY key_hash HAVING COUNT(*) > 1 LIMIT 1").fetchone()',
    'def block_network(event, args):',
    '    if event in ("socket.connect", "subprocess.Popen"): raise PermissionError("preflight offline")',
    'sys.addaudithook(block_network)',
    'from server import db',
    'con = db.connect()',
    'assert tuple(con.execute("PRAGMA quick_check").fetchone()) == ("ok",)',
    'con.close()',
  ].join('\n');
  try { await run(path.join(venv, 'Scripts', 'python.exe'), ['-c', preflight], { cwd: stage, environment, timeout: 60_000 }); }
  catch { throw new Error('备份数据库无法安全迁移，已停止更新；请检查旧数据库完整性及重复密钥记录'); }
}
async function extract({archive,destination,version,root}) {
  // Electron can read its bundled ASAR; the external Python interpreter cannot.
  // Materialize our trusted helper beside the verified archive in staging.
  const helper=path.join(path.dirname(archive),'archive-helper.py');
  fs.writeFileSync(helper,fs.readFileSync(path.join(__dirname,'workbuddy-archive.py')),{flag:'wx'});
  await run(path.join(root,'.venv','Scripts','python.exe'),[helper,archive,destination,version],{cwd:root});
  return path.join(destination,`workbuddy-manager-v${version}`);
}
async function inspectPersistentPaths(root,{python=path.join(root,'.venv','Scripts','python.exe')}={}) {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-workbuddy-inspect-'));
  try{
    const helper=safePath(folder,'workbuddy-data-guard.py');fs.writeFileSync(helper,fs.readFileSync(path.join(__dirname,'workbuddy-archive.py')),{flag:'wx'});
    const resultFile=safePath(folder,'paths.json');
    await runFile(windowlessPython(python),windowlessPythonArgs([helper,'--inspect-data',root,resultFile]),{cwd:root,windowsHide:true,shell:false,timeout:20000,maxBuffer:512*1024,encoding:'utf8',env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});
    const paths=JSON.parse(fs.readFileSync(resultFile,'utf8'));
    if(!Array.isArray(paths)||paths.length<3||paths.some(item=>typeof item.key!=='string'||typeof item.path!=='string'||!path.isAbsolute(item.path)))throw new Error('invalid inspection');
    return paths;
  }catch{throw new Error('无法确认资料目录，暂不能自动更新；请检查控制面板的数据路径配置');}
  finally{if(within(os.tmpdir(),folder)&&path.basename(folder).startsWith('xingzhou-workbuddy-inspect-'))fs.rmSync(folder,{recursive:true,force:true});}
}
function ensureDataOutsideCode(root,paths) {
  for(const item of paths) {
    for(const relative of CODE_PATHS) {
      const code=safePath(root,relative),target=path.resolve(item.path);
      if(path.relative(code,target)===''||within(code,target))throw new Error(`${item.key} 的资料路径位于控制面板程序目录内；请先迁移该资料目录，再更新控制面板`);
    }
  }
}
function allowedAssetRedirect(location, current, original) {
  if (!location || original === RELEASE_API) return null;
  try {
    const next = new URL(location, current);
    if (next.origin === 'https://release-assets.githubusercontent.com' || next.origin === 'https://objects.githubusercontent.com') {
      if (!next.username && !next.password && !next.hash) return next.href;
    }
  } catch { /* Invalid location. */ }
  return null;
}
async function bytes(response,maximum,signal) {
  if ([408, 429, 500, 502, 503, 504].includes(response.status)) {
    await response.body?.cancel().catch(() => {});
    throw new GitHubNetworkError(`GitHub 暂时不可用（HTTP ${response.status}）`);
  }
  if(!response.ok)throw new Error(`GitHub 下载失败（HTTP ${response.status}）`);
  if(response.headers?.get('content-length')&&Number(response.headers.get('content-length'))>maximum)throw new Error('GitHub 文件超过大小限制');
  if(!response.body?.getReader) {const content=Buffer.from(await response.arrayBuffer());if(content.length>maximum)throw new Error('GitHub 文件超过大小限制');return content;}
  const reader=response.body.getReader(), chunks=[];let size=0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, {once:true});
  try{
    while(true){
      let result;
      try { result=await reader.read(); } catch { throw new GitHubNetworkError('GitHub 下载连接中断'); }
      if(result.done)break;
      size+=result.value.length;
      if(size>maximum)throw new Error('GitHub 文件超过大小限制');
      chunks.push(Buffer.from(result.value));
    }
  }finally{signal.removeEventListener('abort',cancel);cancel();}
  return Buffer.concat(chunks,size);
}
function createWorkBuddyUpdater(options={},dependencies={}) {
  const fetchFn=dependencies.fetch||global.fetch;
  const extractFn=dependencies.extract||extract;
  const prepare=dependencies.prepareEnvironment||prepareEnvironment;
  const move=dependencies.move||fs.renameSync;
  const inspectData=dependencies.inspectData||inspectPersistentPaths;
  const backupData=dependencies.backup||createBackup;
  const preflightDatabase=dependencies.validateDatabase||validateDatabase;
  let running=false;
  const progress=(phase,message,extra={})=>{const status={running,phase,message,...extra};try{options.onProgress?.(status);}catch{}return status;};
  async function request(url,maximum) {
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      let timer;
      try {
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(new GitHubNetworkError('连接 GitHub 超时，请稍后重试'));
            controller.abort();
          }, url === RELEASE_API ? 12_000 : 90_000);
        });
        return await Promise.race([requestOnce(url,maximum,controller.signal), timeout]);
      } catch (error) {
        if (attempt >= 1 || !(error instanceof GitHubNetworkError)) throw error;
      } finally { clearTimeout(timer); }
    }
  }
  async function requestOnce(url,maximum,signal) {
    const headers = { Accept: url === RELEASE_API ? 'application/vnd.github+json' : 'application/octet-stream', 'User-Agent': 'Xingzhou-Film-WorkBuddy-Updater' };
    let current = url;
    for (let step = 0; step < 4; step++) {
      let response;
      try { response = await fetchFn(current, { headers, signal, redirect: 'manual', credentials: 'omit' }); }
      catch { throw new GitHubNetworkError('暂时无法连接 GitHub，请稍后重试'); }
      if (response.redirected || (response.url && response.url !== current)) throw new Error('GitHub 下载重定向来源无效');
      if (![301, 302, 303, 307, 308].includes(response.status)) return bytes(response, maximum, signal);
      const next = allowedAssetRedirect(response.headers.get('location'), current, url);
      await response.body?.cancel().catch(() => {});
      if (!next || next === current) throw new Error('GitHub 下载重定向来源无效');
      current = next;
    }
    throw new Error('GitHub 下载重定向次数过多');
  }
  async function checkAt(root) {
    const currentVersion=versionOf(fs.readFileSync(safePath(root,'.version'),'utf8'));
    let response;try{response=JSON.parse((await request(RELEASE_API,1024*1024)).toString('utf8'));}catch(error){if(error instanceof SyntaxError)throw new Error('GitHub 发布信息无效');throw error;}
    const release=validateRelease(response);
    return {release, info:{currentVersion,latestVersion:release.version,available:newer(release.version,currentVersion),releaseUrl:release.releaseUrl,publishedAt:release.publishedAt}};
  }
  async function check() { return (await checkAt(validateRoot(await options.getRoot?.()))).info; }
  async function update({ authorizeInstall } = {}) {
    if(running)throw new Error('WorkBuddy 控制面板正在更新');
    if(typeof options.stop!=='function'||typeof options.start!=='function')throw new Error('WorkBuddy 更新服务尚未配置');
    running=true;let staging=null,root=null,stopped=false,changed=false,startAttempted=false,backupDirectory=null,stagingBase=null,checkpoint=[];const installed=[],backedUp=[];
    try{
      root=validateRoot(await options.getRoot?.());
      ensureDataOutsideCode(root,await inspectData(root));
      progress('checking','检查 GitHub 正式版本');const {info,release}=await checkAt(root);
      if(!info.available){running=false;return progress('done','控制面板已是最新版本',{ok:true,...info});}
      stagingBase=path.resolve(options.stagingDirectory||path.dirname(root));
      staging=fs.mkdtempSync(path.join(stagingBase,'.xingzhou-workbuddy-update-'));
      protectFolder(staging,false);
      progress('downloading','下载 GitHub 正式发布包');
      const archive=await request(release.archive.url,release.archive.size);
      if(archive.length!==release.archive.size)throw new Error('WorkBuddy 发布文件大小不匹配，已拒绝安装');
      if(crypto.createHash('sha256').update(archive).digest('hex')!==release.archive.sha256)throw new Error('WorkBuddy 发布包 SHA-256 校验失败，已拒绝安装');
      progress('verified','发布包 SHA-256 和大小校验通过');
      const archivePath=safePath(staging,'release.tar.gz');fs.writeFileSync(archivePath,archive);
      const stage=await extractFn({archive:archivePath,destination:safePath(staging,'extracted'),version:release.version,root});
      if(!within(staging,path.resolve(stage)))throw new Error('候选程序路径越界');rejectLinks(stage);
      for(const rel of ['server/main.py','server/requirements.txt','web/out/index.html','.version'])if(!fs.statSync(safePath(stage,rel),{throwIfNoEntry:false})?.isFile())throw new Error('WorkBuddy 发布包缺少运行文件');
      if(versionOf(fs.readFileSync(safePath(stage,'.version'),'utf8'))!==release.version)throw new Error('WorkBuddy 发布包版本不匹配');
      const venv=safePath(stage,'.venv');rejectLinks(safePath(root,'.venv'));fs.cpSync(safePath(root,'.venv'),venv,{recursive:true});
      progress('preparing','准备新版本运行环境');await prepare({root,stage,venv,version:release.version});
      const backup=safePath(staging,'backup');fs.mkdirSync(backup);
      for(const rel of CODE_PATHS){safePath(root,rel);if(fs.existsSync(safePath(root,rel)))rejectLinksIfDirectory(safePath(root,rel));}
      // Configuration/group edits may occur during a long package download or
      // candidate pip preparation. Recheck immediately before stopping service.
      const paths=await inspectData(root);
      ensureDataOutsideCode(root,paths);
      const accounts=accountInventory(paths);
      const database=paths.find(item=>item.key==='WB_DB')?.path;
      progress('backup','建立并校验独立只读备份');
      let protectedBackup;
      try { protectedBackup=await backupData(root,paths); }
      catch { throw new Error('无法完成 WorkBuddy 独立只读备份，未安装更新'); }
      backupDirectory=protectedBackup.directory;
      await preflightDatabase({database,reference:protectedBackup.reference,staging,stage,venv});
      await authorizeInstall?.();
      if(!isDeepStrictEqual(paths,await inspectData(root))||!isDeepStrictEqual(accounts,accountInventory(paths)))throw new Error('WorkBuddy 资料配置或账号清单已变更，请重新更新');
      progress('restarting','安装控制面板并重新连接');await options.stop(root);stopped=true;
      checkpoint=checkpointDatabase(database,safePath(staging,'db-checkpoint'));
      for(const rel of CODE_PATHS){const target=safePath(root,rel),saved=safePath(backup,rel),candidate=safePath(stage,rel);fs.mkdirSync(path.dirname(saved),{recursive:true});if(fs.existsSync(target)){move(target,saved);backedUp.push(rel);changed=true;}if(fs.existsSync(candidate)){fs.mkdirSync(path.dirname(target),{recursive:true});move(candidate,target);installed.push(rel);changed=true;}}
      startAttempted=true;
      const status=await options.start(root);
      if(status?.running!==true || (status.version && versionOf(status.version)!==release.version))throw new Error('新版本健康检查未通过');
      if(!isDeepStrictEqual(accounts,accountInventory(paths)))throw new Error('新版本账号清单与更新前不一致');
      await options.verifyInstalled?.({root,status});
      stopped=false;running=false;return progress('done','控制面板更新完成',{ok:true,currentVersion:release.version,latestVersion:release.version,available:false,backupDirectory});
    }catch(error){
      if(stopped){
        progress('rollback','恢复更新前的控制面板');
        try{
          if(changed){
            if(startAttempted){await options.stop(root);restoreDatabase(checkpoint,safePath(staging,'db-failed-candidate'));}
            for(const rel of installed.reverse())fs.rmSync(safePath(root,rel),{recursive:true,force:true});
            for(const rel of backedUp){const saved=safePath(staging,`backup/${rel}`),target=safePath(root,rel);fs.mkdirSync(path.dirname(target),{recursive:true});move(saved,target);}
          }
          const restored=await options.start(root);if(restored?.running!==true)throw new Error('旧版本健康检查未通过');stopped=false;
        }catch{running=false;progress('error','更新失败，自动恢复未完成',{ok:false,backupDirectory:staging});staging=null;throw new Error('控制面板更新失败，自动恢复未完成；更新备份已保留，请检查本机服务');}
        running=false;progress('error','更新失败，已回滚并重新连接原版本',{ok:false,backupDirectory});throw new Error(`控制面板更新失败，已回滚并重新连接原版本：${error.message}`);
      }
      running=false;progress('error',error.message,{ok:false});throw error;
    }finally{
      if(staging&&within(stagingBase,staging)&&path.basename(staging).startsWith('.xingzhou-workbuddy-update-')){
        try { fs.rmSync(staging,{recursive:true,force:true,maxRetries:3,retryDelay:100}); } catch { /* A private stage can be cleaned after restarting. */ }
      }
    }
  }
  return {check,update};
}
function rejectLinksIfDirectory(target){if(fs.statSync(target).isDirectory())rejectLinks(target);}
module.exports={createWorkBuddyUpdater,validateRelease,REPOSITORY,prepareEnvironment,inspectPersistentPaths,ensureDataOutsideCode};
