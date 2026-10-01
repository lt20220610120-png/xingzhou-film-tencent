const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const runFile = require('node:util').promisify(execFile);

const REPOSITORY = 'ithtelab/workbuddy-manager';
const RELEASE_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const RELEASE_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHEGhxZQjEEK/RbtgcRLuuWji0fVB4E2dVKMnhtLlCkx';
const CODE_PATHS = ['server', 'web/out', 'deploy', '.version', '.venv'];
const MAX_ARCHIVE = 64 * 1024 * 1024;

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
  if (!release || release.draft || release.prerelease) throw new Error('未找到可安装的正式发布包');
  const version = versionOf(release.tag_name), tag = `v${version}`;
  if(release.tag_name!==tag) throw new Error('WorkBuddy 发布标签无效');
  const releaseUrl=`https://github.com/${REPOSITORY}/releases/tag/${tag}`;
  if(release.html_url!==releaseUrl) throw new Error('WorkBuddy 发布来源不匹配');
  const assets={};
  for(const suffix of ['tar.gz','tar.gz.sig']) {
    const name=`workbuddy-manager-${tag}.${suffix}`;
    const matches=(release.assets||[]).filter(a=>a.name===name);
    if(matches.length!==1) throw new Error('正式发布包或签名文件缺失');
    const asset=matches[0], expected=`https://github.com/${REPOSITORY}/releases/download/${tag}/${name}`;
    const max=suffix==='tar.gz' ? MAX_ARCHIVE : 16384;
    if(asset.browser_download_url!==expected || !Number.isSafeInteger(asset.size) || asset.size<1 || asset.size>max) throw new Error('WorkBuddy 发布文件信息无效');
    assets[suffix]={name,url:expected,size:asset.size};
  }
  return {version,releaseUrl,publishedAt: typeof release.published_at==='string'?release.published_at:'',archive:assets['tar.gz'],signature:assets['tar.gz.sig']};
}

// OpenSSH PROTOCOL.sshsig: Ed25519 verifies the namespace and hashed whole
// archive. The trusted key is owned by Xingzhou, never loaded from .env or the
// downloaded release, and there is no runtime signature-bypass option.
function sshReader(buffer) {
  let offset=0;
  return {
    bytes(length) { if(!Number.isSafeInteger(length)||length<0||offset+length>buffer.length)throw new Error('签名结构无效'); const b=buffer.subarray(offset,offset+length);offset+=length;return b; },
    uint() { return this.bytes(4).readUInt32BE(); },
    string() { return this.bytes(this.uint()); },
    end() { if(offset!==buffer.length)throw new Error('签名结构无效'); },
  };
}
function sshString(value) { const b=Buffer.isBuffer(value)?value:Buffer.from(value);const n=Buffer.alloc(4);n.writeUInt32BE(b.length);return Buffer.concat([n,b]); }
function verifyReleaseSignature(archive, armor, publicKey=RELEASE_KEY) {
  const match=/^-----BEGIN SSH SIGNATURE-----\s*([A-Za-z0-9+/=\r\n]+)\s*-----END SSH SIGNATURE-----\s*$/.exec(String(armor));
  if(!match || match[1].length>16000)throw new Error('发布包签名无效，已拒绝安装');
  const reader=sshReader(Buffer.from(match[1].replace(/\s/g,''),'base64'));
  if(reader.bytes(6).toString()!=='SSHSIG'||reader.uint()!==1)throw new Error('发布包签名格式无效');
  const key=reader.string(), namespace=reader.string(), reserved=reader.string(), algorithm=reader.string().toString(), wrapped=reader.string();reader.end();
  const trusted=Buffer.from(publicKey.split(/\s+/)[1]||'','base64');
  if(!key.equals(trusted)||namespace.toString()!=='file'||reserved.length!==0||!['sha256','sha512'].includes(algorithm))throw new Error('发布包签名来源无效，已拒绝安装');
  const keyReader=sshReader(key);if(keyReader.string().toString()!=='ssh-ed25519')throw new Error('发布包签名算法无效');const rawKey=keyReader.string();keyReader.end();
  const sigReader=sshReader(wrapped);if(sigReader.string().toString()!=='ssh-ed25519')throw new Error('发布包签名算法无效');const signature=sigReader.string();sigReader.end();
  if(rawKey.length!==32||signature.length!==64)throw new Error('发布包签名长度无效');
  const message=Buffer.concat([Buffer.from('SSHSIG'),sshString(namespace),sshString(reserved),sshString(algorithm),sshString(crypto.createHash(algorithm).update(archive).digest())]);
  const keyObject=crypto.createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),rawKey]),format:'der',type:'spki'});
  if(!crypto.verify(null,message,keyObject,signature))throw new Error('发布包签名校验失败，已拒绝安装');
  return true;
}

function within(root,target) { const relative=path.relative(root,target);return relative!==''&&!path.isAbsolute(relative)&&!relative.startsWith(`..${path.sep}`)&&relative!=='..'; }
function safePath(root,relative) {
  const target=path.resolve(root,relative);
  if(!within(root,target))throw new Error('WorkBuddy 更新路径越界');
  let current=root;
  for(const segment of path.relative(root,target).split(path.sep)) {
    current=path.join(current,segment);
    if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw new Error('WorkBuddy 更新路径包含链接，已拒绝安装');
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
function run(executable,args,{cwd,timeout=180000}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});
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
    const {stdout}=await runFile(python,[helper,'--inspect-data',root],{cwd:root,windowsHide:true,timeout:20000,maxBuffer:512*1024,encoding:'utf8',env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});
    const paths=JSON.parse(stdout);
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
function validResponseUrl(url,original) {
  if(!url)return true;
  const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return false;
  if(original===RELEASE_API)return url===RELEASE_API;
  return u.hostname==='github.com'||u.hostname==='objects.githubusercontent.com'||u.hostname==='release-assets.githubusercontent.com';
}
async function bytes(response,maximum) {
  if(!response.ok)throw new Error(`GitHub 下载失败（HTTP ${response.status}）`);
  if(response.headers?.get('content-length')&&Number(response.headers.get('content-length'))>maximum)throw new Error('GitHub 文件超过大小限制');
  if(!response.body?.getReader) {const content=Buffer.from(await response.arrayBuffer());if(content.length>maximum)throw new Error('GitHub 文件超过大小限制');return content;}
  const reader=response.body.getReader(), chunks=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>maximum)throw new Error('GitHub 文件超过大小限制');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks,size);
}
function createWorkBuddyUpdater(options={},dependencies={}) {
  const fetchFn=dependencies.fetch||global.fetch;
  const verify=dependencies.verifySignature||verifyReleaseSignature;
  const extractFn=dependencies.extract||extract;
  const prepare=dependencies.prepareEnvironment||prepareEnvironment;
  const move=dependencies.move||fs.renameSync;
  const inspectData=dependencies.inspectData||inspectPersistentPaths;
  let running=false, latest=null;
  const progress=(phase,message,extra={})=>{const status={running,phase,message,...extra};try{options.onProgress?.(status);}catch{}return status;};
  async function request(url,maximum) {
    let response;try{response=await fetchFn(url,{headers:{Accept:url===RELEASE_API?'application/vnd.github+json':'application/octet-stream','User-Agent':'Xingzhou-Film-WorkBuddy-Updater'},signal:AbortSignal.timeout(120000)});}catch{throw new Error('暂时无法连接 GitHub，请稍后重试');}
    if(!validResponseUrl(response.url,url))throw new Error('GitHub 下载重定向来源无效');return bytes(response,maximum);
  }
  async function checkAt(root) {
    const currentVersion=versionOf(fs.readFileSync(safePath(root,'.version'),'utf8'));
    let release;try{release=JSON.parse((await request(RELEASE_API,1024*1024)).toString('utf8'));}catch(error){if(error instanceof SyntaxError)throw new Error('GitHub 发布信息无效');throw error;}
    latest=validateRelease(release);
    return {currentVersion,latestVersion:latest.version,available:newer(latest.version,currentVersion),releaseUrl:latest.releaseUrl,publishedAt:latest.publishedAt};
  }
  async function check() { return checkAt(validateRoot(await options.getRoot?.())); }
  async function update() {
    if(running)throw new Error('WorkBuddy 控制面板正在更新');
    if(typeof options.stop!=='function'||typeof options.start!=='function')throw new Error('WorkBuddy 更新服务尚未配置');
    running=true;let staging=null,root=null,stopped=false,changed=false,startAttempted=false;const installed=[],backedUp=[];
    try{
      root=validateRoot(await options.getRoot?.());
      ensureDataOutsideCode(root,await inspectData(root));
      progress('checking','检查 GitHub 正式版本');const info=await checkAt(root);
      if(!info.available){running=false;return progress('done','控制面板已是最新版本',{ok:true,...info});}
      // Freeze the validated release for this operation; a concurrent check must
      // not change which signature or version this archive is matched against.
      const release=latest;
      staging=fs.mkdtempSync(path.join(path.dirname(root),'.xingzhou-workbuddy-update-'));
      progress('downloading','下载正式发布包及签名');
      const archive=await request(release.archive.url,MAX_ARCHIVE),signature=await request(release.signature.url,16384);
      if(archive.length!==release.archive.size||signature.length!==release.signature.size)throw new Error('WorkBuddy 发布文件大小不匹配，已拒绝安装');
      verify(archive,signature.toString('utf8'));progress('verified','发布包签名校验通过',{signature:'verified'});
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
      ensureDataOutsideCode(root,await inspectData(root));
      progress('restarting','安装控制面板并重新连接');await options.stop(root);stopped=true;
      for(const rel of CODE_PATHS){const target=safePath(root,rel),saved=safePath(backup,rel),candidate=safePath(stage,rel);fs.mkdirSync(path.dirname(saved),{recursive:true});if(fs.existsSync(target)){move(target,saved);backedUp.push(rel);changed=true;}if(fs.existsSync(candidate)){fs.mkdirSync(path.dirname(target),{recursive:true});move(candidate,target);installed.push(rel);changed=true;}}
      startAttempted=true;
      const status=await options.start(root);if(status?.running===false)throw new Error('新版本健康检查未通过');
      stopped=false;running=false;return progress('done','控制面板更新完成',{ok:true,currentVersion:release.version,latestVersion:release.version,available:false,signature:'verified'});
    }catch(error){
      if(stopped){
        progress('rollback','恢复更新前的控制面板');
        try{
          if(changed){if(startAttempted)await options.stop(root);for(const rel of installed.reverse())fs.rmSync(safePath(root,rel),{recursive:true,force:true});for(const rel of backedUp){const saved=safePath(staging,`backup/${rel}`),target=safePath(root,rel);fs.mkdirSync(path.dirname(target),{recursive:true});move(saved,target);}}
          const restored=await options.start(root);if(restored?.running===false)throw new Error('旧版本健康检查未通过');stopped=false;
        }catch{running=false;progress('error','更新失败，自动恢复未完成',{ok:false,backupDirectory:staging});staging=null;throw new Error('控制面板更新失败，自动恢复未完成；更新备份已保留，请检查本机服务');}
        running=false;progress('error','更新失败，已回滚并重新连接原版本',{ok:false});throw new Error(`控制面板更新失败，已回滚并重新连接原版本：${error.message}`);
      }
      running=false;progress('error',error.message,{ok:false});throw error;
    }finally{if(staging&&within(path.dirname(root),staging)&&path.basename(staging).startsWith('.xingzhou-workbuddy-update-'))fs.rmSync(staging,{recursive:true,force:true});}
  }
  return {check,update};
}
function rejectLinksIfDirectory(target){if(fs.statSync(target).isDirectory())rejectLinks(target);}
module.exports={createWorkBuddyUpdater,validateRelease,verifyReleaseSignature,REPOSITORY,prepareEnvironment,inspectPersistentPaths,ensureDataOutsideCode};
