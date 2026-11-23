const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {setTimeout:delay}=require('node:timers/promises');
const {createLibTVNetwork,acceptsHost,untilAbort,normalizeLibTVNetworkOptions}=require('./libtv-network.cjs');
const {failure:networkFailure,codeFromCLI}=require('./libtv-network-error.cjs');
const {writeJsonAtomic}=require('./atomic-json.cjs');
const uploadBackoff=[300,800];
const stopped=()=>Error('LibTV 本机连接已停止');
const operationSignal=(lifetime,external)=>external?AbortSignal.any([lifetime,external]):lifetime;
const VERSION='1.1.3';
const ZIP_URL=`https://liblibai-web-static.liblib.cloud/cli/${VERSION}/libtv-windows-amd64.zip`;
const ZIP_SHA='5c5e14b683ebbafba4b2c156be305384bd9f558169d019442e53b2ea04206bd5';
const EXE_SHA='a607ea1f557cb513f302138e64d86312b9dfa9e7eed9dffc5c07f5559192f3fb';
const networkStage=(args)=>{
 if(args[0]==='upload')return '上传参考素材';
 if(args[0]==='download')return '下载生成结果';
 if(args[0]==='node'&&args.includes('--run'))return '提交生成';
 if(args[0]==='node'&&args[1]==='create')return '创建画布节点';
 return {account:'读取账号',model:'读取模型',project:'读取或建立画布',node:'读取画布节点',login:'连接账号'}[args[0]]||'连接官方服务';
};
function parseCLIJSON(text){
 if(text&&typeof text==='object')return text;
 const lines=String(text||'').trim().split(/\r?\n/).filter(Boolean);
 try{return JSON.parse(String(text));}catch{}
 for(let i=lines.length-1;i>=0;i--)try{return JSON.parse(lines[i]);}catch{}
 throw Error('LibTV 未返回可识别的结果，请查看对应官方画布');
}
function loginURL(text){
 for(const match of String(text).matchAll(/https:\/\/[^\s<>"']+/g))try{
  const u=new URL(match[0]),callback=new URL(u.searchParams.get('callback_url'));
  if(u.origin==='https://www.liblib.tv'&&!u.username&&!u.password&&callback.protocol==='http:'&&callback.hostname==='127.0.0.1'&&callback.port&&callback.pathname==='/callback'&&!callback.username&&!callback.password)return u.href;
 }catch{}
 return null;
}
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function libtvResultURLs(raw){const rows=raw?.nodes||raw?.data?.nodes||[raw?.node||raw];const urls=[];for(const n of rows){const d=n?.data||n;for(const value of [d?.url,d?.urls,...(d?.results||[]).flatMap(r=>[r.url,r.urls])])for(const u of Array.isArray(value)?value:[value])if(typeof u==='string'&&/^https:\/\//i.test(u))urls.push(u);}return [...new Set(urls)];}
const {sha256File}=require('./file-digest.cjs');
async function installBinary(root,fetchFn=fetch,external){
 const tools=path.join(root,'tools'),dest=path.join(tools,VERSION,'libtv.exe');
 const signal=operationSignal(AbortSignal.timeout(180000),external);
 try{if(await sha256File(dest,{signal})===EXE_SHA)return dest;}catch(error){if(error.code!=='ENOENT')throw error;}
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('当前 LibTV 连接器支持 Windows x64');
 await fs.promises.mkdir(tools,{recursive:true});
 const actualTools=await fs.promises.realpath(tools),stage=await fs.promises.mkdtemp(path.join(actualTools,'install-'));
 const zip=path.join(stage,'official.zip'),temporary=dest+'.'+crypto.randomUUID()+'.tmp';
 try{
  const response=await fetchFn(ZIP_URL,{redirect:'error',signal});
  if(!response.ok||!response.body)throw Error('LibTV 官方连接器下载失败，请检查网络后重试');
  const {Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
  const hash=crypto.createHash('sha256');let size=0;
  await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,encoding,done){
   size+=chunk.length;if(size>100*1024*1024)return done(Error('LibTV 官方连接器校验失败，未安装或执行'));
   hash.update(chunk);done(null,chunk);
  }}),fs.createWriteStream(zip,{flags:'wx'}),{signal});
  if(hash.digest('hex')!==ZIP_SHA)throw Error('LibTV 官方连接器校验失败，未安装或执行');
  const powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
   await promisify(execFile)(powershell,['-NoProfile','-NonInteractive','-Command','Expand-Archive -LiteralPath $env:XZ_LIBTV_ZIP -DestinationPath $env:XZ_LIBTV_STAGE -Force'],{windowsHide:true,env:{...process.env,XZ_LIBTV_ZIP:zip,XZ_LIBTV_STAGE:stage},timeout:120000,signal});
  const extracted=path.join(stage,'libtv-win-x64','libtv.exe');
   if(await sha256File(extracted,{signal})!==EXE_SHA)throw Error('LibTV 程序校验失败，未执行');
  await fs.promises.mkdir(path.dirname(dest),{recursive:true});
  await fs.promises.copyFile(extracted,temporary,fs.constants.COPYFILE_EXCL);
  await require('./atomic-json.cjs').renameWithRetry(temporary,dest);
  return dest;
 }finally{
  await fs.promises.rm(temporary,{force:true}).catch(()=>{});
  if(require('./workspace-file.cjs').isChildPath(actualTools,stage))await fs.promises.rm(stage,{recursive:true,force:true}).catch(()=>{});
 }
}
function cliFailure(text, operation){
 if(operation==='upload'&&/\bENOENT\b|no such file or directory|找不到.*文件/i.test(text))return Error('参考文件已移动或当前电脑无法读取，请从项目素材重新载入');
 const code=codeFromCLI(text);
 const authStatus=code==='HTTP_401'||code==='HTTP_403';
 if(authStatus||/unauthorized|未登录|登录.*失效/i.test(text))return Error('LibTV 登录失效或账号无权限，请重新连接');
 if(/余额|积分|算力|credit/i.test(text))return Error('LibTV 积分或账号额度不足，请在官网核对');
 if(code){
  const candidate=/\b(?:host|hostname)\s*:\s*['"]([a-z0-9.-]+)['"]/i.exec(text)?.[1]||/attempted address(?:es)?:\s*([a-z0-9.-]+)(?::443|,|\s|\))/i.exec(text)?.[1];
  return networkFailure(code,{host:candidate&&acceptsHost(candidate)?candidate:''});
 }
 return Error(/schema|parameter|参数|model|模型/i.test(text)?'LibTV 拒绝了模型参数，请刷新模型与参数后核对':'LibTV 命令未完成，请检查网络、账号或原画布任务');
}
function spawnCLI(binary,args,{configDir,cwd,onStderr,signal,children,networkEnv={}}){
 if(args.join(' ').length>28000)throw Error('LibTV 本机命令长度超限，请缩短当前镜头提示词或参考路径');
 const env={...process.env,...networkEnv};for(const key of Object.keys(env))if(env[key]==null)delete env[key];for(const k of Object.keys(env))if(/^LIBTV_/i.test(k))delete env[k];env.LIBTV_CONFIG_DIR=configDir;
 for(const k of ['LIBTV_LOGIN_WEB_URL','LIBTV_LOGIN_WEB_PATH','LIBTV_ACCESS_KEY','LIBLIB_ACCESS_KEY','LIBLIB_SECRET_KEY','NODE_OPTIONS'])delete env[k];
 return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{cwd,env,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});children.add(child);
  let stdout='',errorText='';const abort=()=>child.kill();
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  child.stdout.on('data',b=>{stdout+=b.toString('utf8');if(stdout.length>12*1024*1024)child.kill();});
  child.stderr.on('data',b=>{const chunk=b.toString('utf8');errorText=(errorText+chunk).slice(-16000);onStderr?.(chunk);});
  child.on('error',()=>reject(Error('LibTV 连接器无法启动，请重新安装连接器')));
  child.on('close',code=>{children.delete(child);signal?.removeEventListener('abort',abort);
   if(signal?.aborted)return reject(Error('本地等待已停止，官方任务可能仍在运行；请查询原画布，不要重复生成'));
   if(code!==0){try{const terminal=parseCLIJSON(stdout);if(terminal.status===3)return resolve(terminal);}catch{}return reject(cliFailure(errorText,args[0]));}
   if(args[0]==='download')return resolve({ok:true});
   try{resolve(parseCLIJSON(stdout));}catch{if(args[0]==='login'||args[0]==='logout')resolve({ok:true});else reject(Error('LibTV 返回格式暂无法识别，请查看官方画布'));}
  });
 });
}
function audioExtension(bytes, ref, mime=''){
 if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WAVE')return 'wav';
 if(bytes.subarray(0,3).toString()==='ID3')return 'mp3';
 if(bytes.subarray(0,4).toString()==='OggS')return 'ogg';
 if(bytes.subarray(0,4).toString()==='fLaC')return 'flac';
 if(bytes.subarray(4,8).toString()==='ftyp')return 'm4a';
 const ext=({'audio/wav':'wav','audio/x-wav':'wav','audio/mpeg':'mp3','audio/mp4':'m4a',
  'audio/aac':'aac','audio/ogg':'ogg','audio/flac':'flac'})[mime||ref.mime];
 const filename=String(ref.filename||ref.url||'').split(/[?#]/,1)[0];
 return ext||/\.(wav|mp3|m4a|aac|ogg|flac)$/i.exec(filename)?.[1]?.toLowerCase();
}
async function prepareAudioReference(ref,index,dir,signal,readReference){
 if(ref.filePath){
  const file=await fs.promises.stat(ref.filePath).catch(()=>null);
  if(file?.isFile()&&file.size>0)return {filePath:ref.filePath};
 }
 if(!/^https?:\/\//i.test(ref.url||''))throw Error('当前电脑没有可读取的音频，项目里也没有可用地址。请在原电脑打开该分镜并保存以同步音频，或重新上传原音频');
 const {bytes,mime}=readReference
  ? {bytes:Buffer.from(await untilAbort(readReference(ref),signal))}
  : await require('./media-network.cjs').readMediaBytes(ref.url,{label:'LibTV 参考音频下载',signal});
 const ext=audioExtension(bytes,ref,mime);
 if(!bytes.length||!ext)throw Error('无法识别参考音频格式，请核对原音频');
 await fs.promises.mkdir(dir,{recursive:true});
 const filePath=path.join(dir,index+'.'+ext);
 try{await fs.promises.writeFile(filePath,bytes,{signal});}
 catch(error){await fs.promises.unlink(filePath).catch(()=>{});throw error;}
 return {filePath,temporary:true};
}
function referenceError(alias,ref,error){
 const name=String(ref.name||ref.assetName||'').trim().slice(0,60);
 return Object.assign(Error(alias+(name?'「'+name+'」':'')+' 准备失败，未提交生成。'+error.message),{beforeSubmission:true});
}
function createLibTVService({root,safeStorage,runCLI,ensureBinary,openExternal,fetchFn=fetch,readReference,network}={}){
 const networkSettingsFile=path.join(root,'network-settings.json');
 let settings={mode:'system',proxyUrl:''};
 try{settings=normalizeLibTVNetworkOptions(JSON.parse(fs.readFileSync(networkSettingsFile,'utf8')));}catch{}
 const createTransport=()=>createLibTVNetwork({getSettings:()=>settings});
 let transport=network||(runCLI?null:createTransport()),lifetime=new AbortController(),settingsWrite=Promise.resolve();
 const diagnostics=new Map();
 const children=new Set(),sessions=new Map(),schemaCache=new Map(),modelNamesCache=new Map();let installer,epoch=0;
 async function binary(signal){
  if(ensureBinary)return untilAbort(ensureBinary(),signal);
  if(!installer){
   const entry={controller:new AbortController(),users:0,done:false};
   const requestedRoute=settings;
   entry.work=installBinary(root,(url,options)=>fetchFn(url,options,requestedRoute),entry.controller.signal).then(file=>{entry.done=true;return file;},error=>{
    if(installer===entry)installer=null;
    throw error;
   });
   installer=entry;
  }
  const entry=installer;entry.users++;
  try{return await untilAbort(entry.work,signal);}finally{
   if(!--entry.users&&!entry.done&&installer===entry){installer=null;entry.controller.abort(stopped());}
  }
 }
 const ownerKey=id=>{if(typeof id!=='string'||!id)throw Error('请先登录行舟影视账号');return digest(id).slice(0,32);};
 const session=id=>{const key=ownerKey(id);if(!sessions.has(key)){const dir=path.join(root,'accounts',key);fs.mkdirSync(dir,{recursive:true});sessions.set(key,{key,dir,leases:0,runs:0,login:null,pendingLogin:false});}return sessions.get(key);};
 const canEncrypt=()=>{if(!safeStorage?.isEncryptionAvailable())throw Error('系统凭据加密暂不可用，无法连接 LibTV');};
 function unseal(s){canEncrypt();const plain=path.join(s.dir,'credentials.json'),sealed=path.join(s.dir,'credentials.enc');if(!fs.existsSync(plain)&&fs.existsSync(sealed))fs.writeFileSync(plain,safeStorage.decryptString(fs.readFileSync(sealed)),{mode:0o600});}
 function seal(s){if(s.leases)return;const plain=path.join(s.dir,'credentials.json');if(!fs.existsSync(plain))return;canEncrypt();const bytes=safeStorage.encryptString(fs.readFileSync(plain,'utf8'));fs.writeFileSync(path.join(s.dir,'credentials.enc.tmp'),bytes,{mode:0o600});fs.renameSync(path.join(s.dir,'credentials.enc.tmp'),path.join(s.dir,'credentials.enc'));fs.unlinkSync(plain);}
 const accountRoot=path.join(root,'accounts');if(fs.existsSync(accountRoot)&&safeStorage?.isEncryptionAvailable())for(const entry of fs.readdirSync(accountRoot,{withFileTypes:true}))if(entry.isDirectory()&&!entry.isSymbolicLink()&&/^[a-f0-9]{32}$/.test(entry.name)){const s={key:entry.name,dir:path.join(accountRoot,entry.name),leases:0,runs:0,login:null,pendingLogin:false};sessions.set(entry.name,s);seal(s);}
 async function command(id,args,options={}){
  const expected=epoch,signal=operationSignal(lifetime.signal,options.signal),request={...options,signal};
  const readOnly=args[0]==='model'||args[0]==='account'&&['info','list'].includes(args[1])||args[0]==='node'&&args.length===4&&args[2]==='-p';
   request.allowFallback=readOnly||args[0]==='upload'||args[0]==='download'||['node','project'].includes(args[0])&&args[1]==='create';
  try{return await commandOnce(id,args,request);}
  catch(error){
   if(!readOnly||expected!==epoch||signal.aborted||error.code!=='LIBTV_NETWORK'||error.retryable===false)throw error;
    try{await delay(300,undefined,{signal});}catch(error){if(signal.aborted)throw stopped();throw error;}
    return commandOnce(id,args,{...request,retryRoute:error.routeHint});
  }
 }
 async function commandOnce(id,args,options){
  const {signal,retryRoute}=options;
  if(signal.aborted)throw stopped();
  const s=session(id),upload=args[0]==='upload';
  let route,leased=false,channel;
  try{
    const exe=await binary(signal);
    if(!runCLI&&!transport)transport=createTransport();
   channel=transport;
    route=await channel?.environment({upload,signal,retryRoute,allowFallback:options.allowFallback});
   if(signal.aborted)throw stopped();
   const cwd=path.join(s.dir,'work');fs.mkdirSync(cwd,{recursive:true});
   // Keep credentials sealed while proxy and TLS probes are pending.
   unseal(s);
   if(!s.leases)s.idle=new Promise(resolve=>{s.resolveIdle=resolve;});
   s.leases++;leased=true;
    if(signal.aborted)throw stopped();
    options.beforeRun?.();
   const result=await (runCLI?runCLI(args,{...options,configDir:s.dir,cwd}):spawnCLI(exe,args,{...options,configDir:s.dir,cwd,children,networkEnv:route?.env}));
   if(signal.aborted)throw stopped();
   return args[0]==='download'?{ok:true}:parseCLIJSON(result);
  }catch(reason){
   if(signal.aborted)throw args.includes('--run')?Error('LibTV 本地等待已停止，请查询原画布，不要重复生成'):stopped();
   const error=route?.diagnose?.(reason)||reason;
   if(error?.code==='LIBTV_NETWORK'){
     if(!upload)channel?.invalidate?.(error.routeHint);
    error.message=networkStage(args)+'时失败：'+error.message;
   }
   throw error;
  }finally{
    if(route?.routeReport)options.onRoute?.(route.routeReport());
   route?.dispose?.();
   if(leased&&!--s.leases){try{seal(s);}finally{s.resolveIdle();s.resolveIdle=null;}}
  }
 }
 async function uploadReference(id,args,{signal}){
  let retryRoute;
  for(let attempt=0;;attempt++){
   if(signal.aborted)throw stopped();
   try{return await command(id,args,{signal,retryRoute});}
   catch(error){
    if(signal.aborted)throw stopped();
    if(error.code!=='LIBTV_NETWORK'||!(error.retryable??networkFailure(error.networkCode).retryable))throw error;
     transport?.invalidate?.(error.routeHint);
    if(attempt>=uploadBackoff.length){
     error.message+='（已尝试 '+(attempt+1)+' 次）';
     throw error;
    }
    retryRoute=error.routeHint;
    try{await delay(uploadBackoff[attempt],undefined,{signal});}
    catch(error){if(signal.aborted)throw stopped();throw error;}
   }
  }
 }
 const hasCredential=s=>fs.existsSync(path.join(s.dir,'credentials.enc'))||fs.existsSync(path.join(s.dir,'credentials.json'));
  async function identity(id,signal,onRoute){const data=await command(id,['account','info'],{signal,onRoute});const user=data.user||{},account=data.activeAccount||{};if(!user.uuid&&!user.id)throw Error('LibTV 登录信息无法确认，请重新连接');return{loggedIn:true,ownerKey:ownerKey(id),userName:String(user.nickname||'LibTV 用户'),accountName:String(account.accountName||'个人空间'),accountId:String(account.accountId??''),identity:digest(JSON.stringify([user.uuid||user.id,account.accountId,data.teamId??0])),version:VERSION};}
 async function authorizeTask(id,task,signal){if(task.libtvOwnerKey!==ownerKey(id))throw Error('此任务属于其他账号或空间，请连接原 LibTV 账号/空间恢复');const info=await identity(id,signal);if(task.libtvIdentity!==info.identity)throw Error('此任务属于其他账号或空间，请连接原 LibTV 账号/空间恢复');return info;}
  async function schema(id,model,kind,signal,account){
  if(typeof model!=='string'||!model.trim()||model.startsWith('-'))throw Error('LibTV 模型编号无效');
   const info=account||await identity(id,signal),key=info.identity+':'+kind+':'+model;let cached=schemaCache.get(key);
  if(!cached||Date.now()-cached.time>10*60*1000){
   let raw=await command(id,['model',model],{signal});const resolvedKind=kind||raw.modality;
   // CLI 1.1.3 echoes the lookup key as modelName in detail responses, while
   // node -s model requires the display name returned by model search.
   if(!raw.modelName||raw.modelName===(raw.modelKey||model)){
    if(!['image','video'].includes(resolvedKind))throw Error('LibTV 模型类型无法确认，请刷新模型与参数');
    const namesKey=info.identity+':'+resolvedKind;let names=modelNamesCache.get(namesKey);
    if(!names||Date.now()-names.time>10*60*1000){const found=await command(id,['model','search','--type',resolvedKind],{signal});names={time:Date.now(),rows:Array.isArray(found.matches)?found.matches:[]};modelNamesCache.set(namesKey,names);}
    const displayName=names.rows.find(m=>m.modelKey===(raw.modelKey||model))?.modelName;
    if(typeof displayName!=='string'||!displayName.trim()||displayName===(raw.modelKey||model))throw Error('LibTV 模型名称无法确认，请刷新模型与参数，未提交生成');
    raw={...raw,modelName:displayName};
   }
   const core=await import('../core/libtv.js');cached={time:Date.now(),model:core.libtvModel(raw,resolvedKind)};schemaCache.set(key,cached);
  }
  return cached.model;
 }
 async function query(id,task,{signal:external}={}){const signal=operationSignal(lifetime.signal,external);signal.throwIfAborted();await authorizeTask(id,task,signal);return command(id,['node',task.libtvNodeId,'-p',task.libtvProjectId],{signal});}
 function taskUrl(task){return 'https://www.liblib.tv/canvas?projectId='+encodeURIComponent(task.libtvProjectId);}
 function projectState(id,info){
  const file=path.join(session(id).dir,'projects-'+info.identity+'.json');let value={selectedId:'',projects:[]};
  if(fs.existsSync(file)){try{value=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(value.projects)||typeof value.selectedId!=='string')throw Error();}catch{throw Error('LibTV 项目记录读取失败，原文件已保留，请先核对本机资料');}}
  return {file,value};
 }
 function saveProjects(file,value){const temporary=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value),{mode:0o600});fs.renameSync(temporary,file);}
 const projectResult=raw=>raw.projectMeta?.uuid||raw.projectUuid||raw.uuid||raw.data?.projectMeta?.uuid||raw.data?.projectUuid;
 async function ensureProject(id,info,{name='行舟影视 · 默认项目',signal,force=false}={}){
  const s=session(id),prior=s.projectWriter||Promise.resolve();
  const work=prior.catch(()=>{}).then(async()=>{
   const {file,value}=projectState(id,info),selected=value.projects.find(p=>p.id===value.selectedId);
   if(!force&&selected)return selected;
   const raw=await command(id,['project','create',name],{signal}),projectId=projectResult(raw);
   if(typeof projectId!=='string'||!projectId)throw Error('LibTV 画布创建未确认，请到官网核对，未提交生成');
   const row={id:projectId,name,createdAt:Date.now(),url:taskUrl({libtvProjectId:projectId})};value.projects.push(row);value.selectedId=row.id;saveProjects(file,value);return row;
  });s.projectWriter=work;return work;
 }
 async function changeProject(id,action){const s=session(id);if(s.runs||s.leases||s.pendingLogin||s.switching)throw Error('任务正在准备或提交，请完成后再切换 LibTV 项目');s.switching=true;try{return await action(await identity(id));}finally{s.switching=false;}}
 const projectName=name=>{const clean=String(name||'').trim();if(!clean||clean.length>80)throw Error('项目名称需为1至80个字');return clean;};
 function projectIdOf(value){let id=String(value||'').trim();if(id.startsWith('https://')){const u=new URL(id);if(u.origin!=='https://www.liblib.tv'||u.pathname!=='/canvas')throw Error('请填写 LibTV 官方画布链接或项目编号');id=u.searchParams.get('projectId')||'';}if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,255}$/.test(id))throw Error('LibTV 项目编号无效');return id;}
  async function cancelConnectionTest(id){
   if(id===undefined){await Promise.all([...diagnostics.keys()].map(cancelConnectionTest));return;}
   const active=diagnostics.get(id);
   active?.controller.abort(stopped());
   await active?.work;
  }
  function testConnection(id,{signal:external}={}){
   const existing=diagnostics.get(id);
   if(existing)return existing.work;
   const controller=new AbortController(),timeout=AbortSignal.timeout(35000);
   const signal=AbortSignal.any([operationSignal(lifetime.signal,external),controller.signal,timeout]);
   const work=(async()=>{
    const steps=[];
    let stage='account',route='';
    const onRoute=report=>{
     const protocol=report?.route,source=report?.source;
     if(protocol==='direct')route='direct';
     else if(['http','https','socks4','socks5'].includes(protocol)&&['system-proxy','custom-proxy'].includes(source))route=source.split('-')[0]+'-'+protocol;
    };
    const fail=(code,detail,suggestion)=>({ok:false,steps:[...steps,{stage,ok:false,route,code,detail}],suggestion});
    if(!hasCredential(session(id)))return fail('NO_CREDENTIALS','本机尚未授权','请先连接 LibTV 账号');
    try{
     await identity(id,signal,onRoute);
     steps.push({stage,ok:true,route,code:'',detail:'账号可读取'});
     stage='models';route='';
     for(const kind of ['image','video']){
      const raw=await command(id,['model','search','--type',kind],{signal,onRoute});
      if(!Array.isArray(raw.matches))throw Error('模型列表无法确认');
     }
     return {ok:true,steps:[...steps,{stage,ok:true,route,code:'',detail:'图片和视频模型列表可读取'}],suggestion:''};
    }catch(error){
     if(signal.aborted)return timeout.aborted
      ?fail('ETIMEDOUT','连接测试超时','请检查当前代理或尝试直连')
      :fail('CANCELLED','连接测试已取消','');
     if(error?.code==='LIBTV_NETWORK'){
      const raw=String(error.networkCode||'');
      const code=codeFromCLI(raw)||(/^(?:PROXY_HTTP|HTTP)_[45]\d{2}$/.test(raw)?raw:'NETWORK_ERROR');
      return fail(code,networkFailure(code).message,'请检查当前代理、网络模式或稍后重试');
     }
     return stage==='account'
      ?fail('ACCOUNT_UNAVAILABLE','无法验证 LibTV 授权','请核对本机授权后重新测试')
      :fail('MODELS_UNAVAILABLE','无法读取模型列表','请稍后重试并核对 LibTV 服务状态');
    }
   })().finally(()=>{if(diagnostics.get(id)?.controller===controller)diagnostics.delete(id);});
   diagnostics.set(id,{controller,work});
   return work;
  }
 return {
   networkSettings:()=>({...settings}),
   saveNetworkSettings(input){
    return settingsWrite=settingsWrite.catch(()=>{}).then(async()=>{
     const next=normalizeLibTVNetworkOptions(input);
     if(next.mode===settings.mode&&next.proxyUrl===settings.proxyUrl)return {...settings};
     if([...sessions.values()].some(s=>s.runs||s.pendingLogin||s.switching))throw Error('请在 LibTV 任务完成后再切换网络模式');
     await Promise.all([...diagnostics.keys()].map(cancelConnectionTest));
     try{await writeJsonAtomic(networkSettingsFile,next);}catch{throw Error('无法保存本机 LibTV 网络设置');}
     settings=next;transport?.invalidate?.();
     return {...settings};
    });
   },
   testConnection,cancelConnectionTest,
   async status(id){const s=session(id);if(s.pendingLogin)return{loggedIn:false,pendingLogin:true,ownerKey:s.key,message:'请在浏览器完成 LibTV 授权'};if(!hasCredential(s))return{loggedIn:false,ownerKey:s.key,message:s.loginError||'尚未连接 LibTV',version:VERSION};try{const info=await identity(id),{value}=projectState(id,info);return {...info,configured:true,running:s.runs>0||Boolean(s.switching),currentProject:value.projects.find(p=>p.id===value.selectedId)||null};}catch(e){return{loggedIn:false,configured:true,ownerKey:s.key,message:e.message,version:VERSION};}},
  async projects(id){const info=await identity(id),{value}=projectState(id,info);return {...value,identity:info.identity};},
  async createProject(id,name){return changeProject(id,info=>ensureProject(id,info,{name:projectName(name),force:true}));},
  async useProject(id,value,name){return changeProject(id,async info=>{
   const projectId=projectIdOf(value),{file,value:state}=projectState(id,info);
   // Explicit -p checks the current account's access without changing CLI cwd
   // bindings, uploading media, or starting paid generation.
   await command(id,['node','list','-p',projectId]);
   let row=state.projects.find(p=>p.id===projectId);if(!row){row={id:projectId,name:name?projectName(name):projectId,url:taskUrl({libtvProjectId:projectId}),createdAt:Date.now()};state.projects.push(row);}state.selectedId=projectId;saveProjects(file,state);return row;
  });},
   async login(id){await cancelConnectionTest(id);const s=session(id);if(s.login)return s.login;if(s.runs||s.leases||s.switching)throw Error('LibTV 任务运行中，请完成后再登录或切换账号');s.pendingLogin=true;
   let opened=false,buffer='';s.loginError='';s.loginController=new AbortController();s.login=command(id,['login','web'],{signal:s.loginController.signal,onStderr:chunk=>{buffer=(buffer+chunk).slice(-16000);const url=loginURL(buffer);if(url&&!opened){opened=true;Promise.resolve(openExternal(url)).catch(()=>{});}}}).then(()=>identity(id)).finally(()=>{s.pendingLogin=false;s.login=null;s.loginController=null;});return s.login;},
  async cancelLogin(id){const s=session(id);s.loginController?.abort();if(s.login)await s.login.catch(()=>{});return this.status(id);},
  async startLogin(id){const s=session(id);if(s.pendingLogin)return{pendingLogin:true,loggedIn:false,ownerKey:s.key};const work=this.login(id);work.catch(e=>{s.loginError=e.message;});return{pendingLogin:true,loggedIn:false,ownerKey:s.key};},
   async logout(id){await cancelConnectionTest(id);const s=session(id);if(s.runs||s.leases||s.pendingLogin||s.switching)throw Error('LibTV 正在运行或授权，请完成后再断开');for(const name of ['credentials.json','credentials.enc']){const f=path.join(s.dir,name);if(fs.existsSync(f))fs.unlinkSync(f);}schemaCache.clear();modelNamesCache.clear();return{loggedIn:false,ownerKey:s.key,message:'本机连接已断开，已生成成果保留'};},
  async accounts(id){await identity(id);const raw=await command(id,['account','list']);return(raw.accounts||[]).map(a=>({accountId:String(a.accountId),accountName:String(a.accountName),isActive:!!a.isActive}));},
   async useAccount(id,accountId){await cancelConnectionTest(id);const s=session(id);if(s.runs||s.leases||s.pendingLogin||s.switching)throw Error('任务运行中，请完成后再切换 LibTV 空间');s.switching=true;try{const choices=await this.accounts(id);if(!choices.some(a=>a.accountId===String(accountId)))throw Error('请选择当前 LibTV 账号可用空间');await command(id,['account','use',String(accountId)]);schemaCache.clear();modelNamesCache.clear();return await identity(id);}finally{s.switching=false;}},
  async models(id){const info=await identity(id);schemaCache.clear();const list=async kind=>{const raw=await command(id,['model','search','--type',kind]);const rows=Array.isArray(raw.matches)?raw.matches:[];modelNamesCache.set(info.identity+':'+kind,{time:Date.now(),rows});return rows.map(m=>({id:m.modelKey,name:m.modelName,kind})).filter(m=>m.id&&m.name);};return{...info,imageModels:await list('image'),videoModels:await list('video')};},
  schema,
  async prepare(id,input){
   if(input.libtvOwnerKey!==ownerKey(id))throw Error('此 LibTV 配置缺少当前账号绑定或属于其他行舟账号，请重新连接');
   if(!input.references?.length&&(input.firstFramePath||input.firstFrameUrl))input={...input,references:[{kind:'image',...(input.firstFramePath?{filePath:input.firstFramePath}:{url:input.firstFrameUrl})}]};
   const scope=session(id);if(scope.pendingLogin||scope.switching)throw Error('LibTV 账号正在授权或切换，请稍后生成');scope.runs++;
   const signal=operationSignal(lifetime.signal,input.signal),dir=path.join(scope.dir,'references',crypto.randomUUID()),temporaryAudio=[],audioFiles=new Map();
    try{const info=await identity(id,signal),model=await schema(id,input.model,input.kind,signal,info),core=await import('../core/libtv.js'),params=core.libtvGenerationParams(model,input);
   if(signal.aborted)throw stopped();
   if(input.libtvOwnerKey&&input.libtvOwnerKey!==info.ownerKey)throw Error('此 LibTV 配置属于其他行舟账号，请重新连接');
   const references=input.references||[];
   let audioIndex=0;
   for(const [index,ref] of references.entries()){
    if(ref.kind!=='audio')continue;
    const alias='@audio'+(++audioIndex);
    try{
     if(signal.aborted)throw stopped();
    const audio=await prepareAudioReference(ref,index,dir,signal,readReference);
     audioFiles.set(index,audio.filePath);
     if(audio.temporary)temporaryAudio.push(audio.filePath);
    }catch(error){throw referenceError(alias,ref,signal.aborted?stopped():error);}
   }
   const label='行舟影视-'+input.kind+'-'+(input.id||crypto.randomUUID());
   const project=await ensureProject(id,info,{signal}),projectId=project.id;
   const ids=[],counts={image:0,audio:0,video:0};
   for(const [index,ref] of references.entries()){
    if(!['image','video','audio'].includes(ref.kind))throw Error('LibTV 参考类型无效');
    const alias='@'+ref.kind+(++counts[ref.kind]);
    let filePath=audioFiles.get(index)||ref.filePath,temporary;
    try{
      if(signal.aborted)throw stopped();
     if(!filePath){
      const ext={image:'png',video:'mp4',audio:'mp3'}[ref.kind];
      const bytes=readReference?await untilAbort(readReference(ref),signal):(await require('./media-network.cjs').readMediaBytes(ref.url,{label:'LibTV 参考素材',signal})).bytes;
      fs.mkdirSync(dir,{recursive:true});filePath=temporary=path.join(dir,index+'.'+ext);await fs.promises.writeFile(filePath,bytes,{signal});
     }
     const uploaded=await uploadReference(id,['upload','参考-'+(index+1),'-p',projectId,'-t',ref.kind,'--resource',filePath],{signal});
     const key=uploaded.nodeKey||uploaded.newNodeKey;
     if(!key)throw Error('LibTV 参考上传未确认');
     ids.push(key);
    }catch(error){
     throw referenceError(alias,ref,signal.aborted?stopped():error);
    }finally{
     if(temporary)try{fs.rmSync(temporary,{force:true});fs.rmdirSync(dir);}catch{}
    }
   }
   const args=['node','create',label,'-p',projectId,'-t',input.kind,'--prompt',params.prompt];
   for(const [key,value] of Object.entries(params))if(key!=='prompt')args.push('-s',key+'='+(typeof value==='object'?JSON.stringify(value):String(value)));
   for(const key of ids)args.push('--left',key);
   const created=await command(id,args,{signal}),nodeId=created.nodeKey||created.newNodeKey;
   if(typeof nodeId!=='string'||!nodeId)throw Error('LibTV 节点创建未确认，未提交生成');
   const baseline=await command(id,['node',nodeId,'-p',projectId],{signal});
   return{libtvOwnerKey:info.ownerKey,libtvIdentity:info.identity,libtvProjectId:projectId,libtvProjectName:project.name,libtvNodeId:nodeId,libtvCanvasUrl:taskUrl({libtvProjectId:projectId}),libtvInitialUrls:libtvResultURLs(baseline),jobId:nodeId};
   }finally{
    for(const file of temporaryAudio)await fs.promises.unlink(file).catch(()=>{});
    await fs.promises.rmdir(dir).catch(()=>{});
    scope.runs--;
   }
  },
  async run(id,task,{signal:external,beforeRun}={}){
   const signal=operationSignal(lifetime.signal,external),s=session(id);
   let launched=false;
   s.runs++;
   try{
    if(s.pendingLogin||s.switching)throw Error('LibTV 账号正在授权或切换，请稍后重试');
    await authorizeTask(id,task,signal);
    return await command(id,['node',task.libtvNodeId,'-p',task.libtvProjectId,'--run'],{signal,beforeRun(){
     beforeRun?.();
     launched=true;
    }});
   }catch(error){
    if(!launched)error.beforeSubmission=true;
    throw error;
   }finally{s.runs--;}
  },
  query,
  async download(id,task,destDir,{signal:external}={}){const signal=operationSignal(lifetime.signal,external);signal.throwIfAborted();const scope=session(id);if(scope.pendingLogin||scope.switching)throw Error('LibTV 账号正在切换，请稍后恢复原结果');scope.runs++;try{await authorizeTask(id,task,signal);signal?.throwIfAborted();const dir=path.join(destDir,'libtv-'+task.id);fs.mkdirSync(dir,{recursive:true});await command(id,['download','-n',task.libtvNodeId,'-p',task.libtvProjectId,'-o',dir],{signal});
   const mediaName=n=>task.kind==='image'?/\.(png|jpe?g|webp)$/i.test(n):/\.(mp4|webm|mov)$/i.test(n);
   let index=0,total=0;for(const archive of fs.readdirSync(dir).filter(n=>/\.zip$/i.test(n))){
    const zip=await require('jszip').loadAsync(await fs.promises.readFile(path.join(dir,archive),{signal}));for(const entry of Object.values(zip.files)){
     if(entry.dir||!mediaName(entry.name))continue;const original=entry.unsafeOriginalName||entry.name;
     if(/(?:^|[\\/])\.\.(?:[\\/]|$)|^[\\/]|:/.test(original)||index>=128)continue;
     const file=path.join(dir,`result-${index++}-`+path.basename(entry.name).replace(/[\\/:*?"<>|]/g,'_'));const temporary=file+'.tmp';
     const {Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
     try{await pipeline(entry.nodeStream(),new Transform({transform(chunk,encoding,done){total+=chunk.length;done(total>1024*1024*1024?Error('LibTV 结果解压大小超限'):null,chunk);}}),fs.createWriteStream(temporary),{signal});fs.renameSync(temporary,file);}
     finally{fs.rmSync(temporary,{force:true});}
    }
   }
   const files=fs.readdirSync(dir).filter(mediaName).map(n=>path.join(dir,n)).filter(file=>fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink());if(!files.length)throw Error('LibTV 结果尚未可下载，请打开原画布核对后刷新');return{filePath:files[0],files};}finally{scope.runs--;}},
  async close(){
   const tests=[...diagnostics.values()].map(entry=>entry.work);
   const installation=installer&&!installer.done?installer:null;
   if(installation){installer=null;installation.controller.abort(stopped());}
   epoch++;lifetime.abort(stopped());lifetime=new AbortController();const oldTransport=transport;transport=null;
   for(const s of sessions.values())s.loginController?.abort();
   const exiting=new Promise(resolve=>{
    if(!children.size)return resolve();
    const timer=setTimeout(resolve,5000);let left=children.size;
    for(const child of [...children]){child.once('close',()=>{if(!--left){clearTimeout(timer);resolve();}});try{child.kill();}catch{}}
   });
   const leases=[...sessions.values()].map(s=>s.idle).filter(Boolean);
   const phases=await Promise.allSettled([exiting,Promise.resolve().then(()=>oldTransport?.close?.()),installation?.work.catch(()=>{}),...leases,...tests]);
   const results=await Promise.allSettled([
    ...[...sessions.values()].map(s=>Promise.resolve().then(()=>{if(!s.leases)seal(s);})),
   ]);
   const failure=[...phases,...results].find(result=>result.status==='rejected');
   if(failure)throw failure.reason;
  },
  hasRunning:()=>[...sessions.values()].some(s=>s.runs>0||s.leases>0||s.pendingLogin||s.switching),
 };
}
module.exports={createLibTVService,parseCLIJSON,loginURL,installBinary,libtvResultURLs,spawnCLI,cliFailure};
