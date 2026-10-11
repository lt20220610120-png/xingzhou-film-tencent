const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const VERSION='1.1.3';
const ZIP_URL=`https://liblibai-web-static.liblib.cloud/cli/${VERSION}/libtv-windows-amd64.zip`;
const ZIP_SHA='5c5e14b683ebbafba4b2c156be305384bd9f558169d019442e53b2ea04206bd5';
const EXE_SHA='a607ea1f557cb513f302138e64d86312b9dfa9e7eed9dffc5c07f5559192f3fb';
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
async function installBinary(root,fetchFn=fetch){
 const dest=path.join(root,'tools',VERSION,'libtv.exe');
 if(fs.existsSync(dest)&&digest(fs.readFileSync(dest))===EXE_SHA)return dest;
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('当前 LibTV 连接器支持 Windows x64');
 const response=await fetchFn(ZIP_URL,{redirect:'error',signal:AbortSignal.timeout(180000)});
 if(!response.ok)throw Error('LibTV 官方连接器下载失败，请检查网络后重试');
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length>100*1024*1024||digest(bytes)!==ZIP_SHA)throw Error('LibTV 官方连接器校验失败，未安装或执行');
 const stage=path.join(root,'tools','install-'+crypto.randomUUID());fs.mkdirSync(stage,{recursive:true});
 const zip=path.join(stage,'official.zip');fs.writeFileSync(zip,bytes);
 const powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 await promisify(execFile)(powershell,['-NoProfile','-NonInteractive','-Command','Expand-Archive -LiteralPath $env:XZ_LIBTV_ZIP -DestinationPath $env:XZ_LIBTV_STAGE -Force'],{windowsHide:true,env:{...process.env,XZ_LIBTV_ZIP:zip,XZ_LIBTV_STAGE:stage},timeout:120000});
 const extracted=path.join(stage,'libtv-win-x64','libtv.exe');
 if(digest(fs.readFileSync(extracted))!==EXE_SHA)throw Error('LibTV 程序校验失败，未执行');
 fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(extracted,dest+'.tmp');fs.renameSync(dest+'.tmp',dest);
 // Only remove known files produced by this install; no user profile or projects.
 fs.unlinkSync(zip);fs.unlinkSync(extracted);fs.rmdirSync(path.dirname(extracted));fs.rmdirSync(stage);
 return dest;
}
function spawnCLI(binary,args,{configDir,cwd,onStderr,signal,children}){
 if(args.join(' ').length>28000)throw Error('LibTV 本机命令长度超限，请缩短当前镜头提示词或参考路径');
 const env={...process.env};for(const k of Object.keys(env))if(/^LIBTV_/i.test(k))delete env[k];env.LIBTV_CONFIG_DIR=configDir;
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
   if(code!==0){try{const terminal=parseCLIJSON(stdout);if(terminal.status===3)return resolve(terminal);}catch{}const message=/401|403|unauthorized|未登录|登录.*失效/i.test(errorText)?'LibTV 登录失效或账号无权限，请重新连接':/余额|积分|算力|credit/i.test(errorText)?'LibTV 积分或账号额度不足，请在官网核对':/schema|parameter|参数|model|模型/i.test(errorText)?'LibTV 拒绝了模型参数，请刷新模型与参数后核对':'LibTV 命令未完成，请检查网络、账号或原画布任务';return reject(Error(message));}
   if(args[0]==='download')return resolve({ok:true});
   try{resolve(parseCLIJSON(stdout));}catch{if(args[0]==='login'||args[0]==='logout')resolve({ok:true});else reject(Error('LibTV 返回格式暂无法识别，请查看官方画布'));}
  });
 });
}
function createLibTVService({root,safeStorage,runCLI,ensureBinary,openExternal,fetchFn=fetch,readReference}={}){
 const children=new Set(),sessions=new Map(),schemaCache=new Map();let installer,epoch=0;
 const binary=()=>ensureBinary?ensureBinary():(installer||(installer=installBinary(root,fetchFn).catch(e=>{installer=null;throw e;})));
 const ownerKey=id=>{if(typeof id!=='string'||!id)throw Error('请先登录行舟影视账号');return digest(id).slice(0,32);};
 const session=id=>{const key=ownerKey(id);if(!sessions.has(key)){const dir=path.join(root,'accounts',key);fs.mkdirSync(dir,{recursive:true});sessions.set(key,{key,dir,leases:0,runs:0,login:null,pendingLogin:false});}return sessions.get(key);};
 const canEncrypt=()=>{if(!safeStorage?.isEncryptionAvailable())throw Error('系统凭据加密暂不可用，无法连接 LibTV');};
 function unseal(s){canEncrypt();const plain=path.join(s.dir,'credentials.json'),sealed=path.join(s.dir,'credentials.enc');if(!fs.existsSync(plain)&&fs.existsSync(sealed))fs.writeFileSync(plain,safeStorage.decryptString(fs.readFileSync(sealed)),{mode:0o600});}
 function seal(s){if(s.leases)return;const plain=path.join(s.dir,'credentials.json');if(!fs.existsSync(plain))return;canEncrypt();const bytes=safeStorage.encryptString(fs.readFileSync(plain,'utf8'));fs.writeFileSync(path.join(s.dir,'credentials.enc.tmp'),bytes,{mode:0o600});fs.renameSync(path.join(s.dir,'credentials.enc.tmp'),path.join(s.dir,'credentials.enc'));fs.unlinkSync(plain);}
 const accountRoot=path.join(root,'accounts');if(fs.existsSync(accountRoot)&&safeStorage?.isEncryptionAvailable())for(const entry of fs.readdirSync(accountRoot,{withFileTypes:true}))if(entry.isDirectory()&&!entry.isSymbolicLink()&&/^[a-f0-9]{32}$/.test(entry.name)){const s={key:entry.name,dir:path.join(accountRoot,entry.name),leases:0,runs:0,login:null,pendingLogin:false};sessions.set(entry.name,s);seal(s);}
 async function command(id,args,options={}){
  const s=session(id),expected=epoch,exe=await binary();if(expected!==epoch||options.signal?.aborted)throw Error('LibTV 本机连接已停止，请重新操作');unseal(s);s.leases++;
  const cwd=path.join(s.dir,'work');fs.mkdirSync(cwd,{recursive:true});
  try{const result=await (runCLI?runCLI(args,{...options,configDir:s.dir,cwd}):spawnCLI(exe,args,{...options,configDir:s.dir,cwd,children}));if(expected!==epoch||options.signal?.aborted)throw Error('LibTV 本地等待已停止，请查询原画布，不要重复生成');return args[0]==='download'?{ok:true}:parseCLIJSON(result);}
  finally{s.leases--;seal(s);}
 }
 const hasCredential=s=>fs.existsSync(path.join(s.dir,'credentials.enc'))||fs.existsSync(path.join(s.dir,'credentials.json'));
 async function identity(id){const data=await command(id,['account','info']);const user=data.user||{},account=data.activeAccount||{};if(!user.uuid&&!user.id)throw Error('LibTV 登录信息无法确认，请重新连接');return{loggedIn:true,ownerKey:ownerKey(id),userName:String(user.nickname||'LibTV 用户'),accountName:String(account.accountName||'个人空间'),accountId:String(account.accountId??''),identity:digest(JSON.stringify([user.uuid||user.id,account.accountId,data.teamId??0])),version:VERSION};}
 async function authorizeTask(id,task){const info=await identity(id);if(task.libtvOwnerKey!==ownerKey(id)||task.libtvIdentity!==info.identity)throw Error('此任务属于其他账号或空间，请连接原 LibTV 账号/空间恢复');return info;}
 async function schema(id,model,kind){if(typeof model!=='string'||!model.trim()||model.startsWith('-'))throw Error('LibTV 模型编号无效');const info=await identity(id),key=info.identity+':'+kind+':'+model;let cached=schemaCache.get(key);if(!cached||Date.now()-cached.time>10*60*1000){const raw=await command(id,['model',model]);const core=await import('../core/libtv.js');cached={time:Date.now(),model:core.libtvModel(raw,kind||raw.modality)};schemaCache.set(key,cached);}return cached.model;}
 async function query(id,task){await authorizeTask(id,task);const raw=await command(id,['node',task.libtvNodeId,'-p',task.libtvProjectId]);return raw;}
 function taskUrl(task){return 'https://www.liblib.tv/canvas?projectId='+encodeURIComponent(task.libtvProjectId);}
 return {
  async status(id){const s=session(id);if(s.pendingLogin)return{loggedIn:false,pendingLogin:true,ownerKey:s.key,message:'请在浏览器完成 LibTV 授权'};if(!hasCredential(s))return{loggedIn:false,ownerKey:s.key,message:s.loginError||'尚未连接 LibTV',version:VERSION};try{return {...await identity(id),running:s.runs>0};}catch(e){return{loggedIn:false,ownerKey:s.key,message:e.message,version:VERSION};}},
  async login(id){const s=session(id);if(s.runs||s.leases)throw Error('LibTV 任务运行中，请完成后再登录或切换账号');if(s.login)return s.login;s.pendingLogin=true;
   let opened=false,buffer='';s.loginError='';s.loginController=new AbortController();s.login=command(id,['login','web'],{signal:s.loginController.signal,onStderr:chunk=>{buffer=(buffer+chunk).slice(-16000);const url=loginURL(buffer);if(url&&!opened){opened=true;Promise.resolve(openExternal(url)).catch(()=>{});}}}).then(()=>identity(id)).finally(()=>{s.pendingLogin=false;s.login=null;s.loginController=null;});return s.login;},
  async cancelLogin(id){const s=session(id);s.loginController?.abort();if(s.login)await s.login.catch(()=>{});return this.status(id);},
  async startLogin(id){const s=session(id);if(s.pendingLogin)return{pendingLogin:true,loggedIn:false,ownerKey:s.key};const work=this.login(id);work.catch(e=>{s.loginError=e.message;});return{pendingLogin:true,loggedIn:false,ownerKey:s.key};},
  async logout(id){const s=session(id);if(s.runs||s.leases||s.pendingLogin)throw Error('LibTV 正在运行或授权，请完成后再断开');for(const name of ['credentials.json','credentials.enc']){const f=path.join(s.dir,name);if(fs.existsSync(f))fs.unlinkSync(f);}schemaCache.clear();return{loggedIn:false,ownerKey:s.key,message:'本机连接已断开，已生成成果保留'};},
  async accounts(id){await identity(id);const raw=await command(id,['account','list']);return(raw.accounts||[]).map(a=>({accountId:String(a.accountId),accountName:String(a.accountName),isActive:!!a.isActive}));},
  async useAccount(id,accountId){const s=session(id);if(s.runs||s.leases||s.pendingLogin||s.switching)throw Error('任务运行中，请完成后再切换 LibTV 空间');s.switching=true;try{const choices=await this.accounts(id);if(!choices.some(a=>a.accountId===String(accountId)))throw Error('请选择当前 LibTV 账号可用空间');await command(id,['account','use',String(accountId)]);schemaCache.clear();return await identity(id);}finally{s.switching=false;}},
  async models(id){const info=await identity(id),core=await import('../core/libtv.js');const list=async kind=>{const raw=await command(id,['model','search','--type',kind]);return(raw.matches||[]).map(m=>({id:m.modelKey,name:m.modelName,kind})).filter(m=>m.id&&m.name);};return{...info,imageModels:await list('image'),videoModels:await list('video')};},
  schema,
  async prepare(id,input){
   if(input.libtvOwnerKey!==ownerKey(id))throw Error('此 LibTV 配置缺少当前账号绑定或属于其他行舟账号，请重新连接');
   if(!input.references?.length&&(input.firstFramePath||input.firstFrameUrl))input={...input,references:[{kind:'image',...(input.firstFramePath?{filePath:input.firstFramePath}:{url:input.firstFrameUrl})}]};
   const scope=session(id);if(scope.pendingLogin||scope.switching)throw Error('LibTV 账号正在授权或切换，请稍后生成');scope.runs++;
   try{const expected=epoch;const info=await identity(id),model=await schema(id,input.model,input.kind),core=await import('../core/libtv.js'),params=core.libtvGenerationParams(model,input);
   if(expected!==epoch||input.signal?.aborted)throw Error('LibTV 本机连接已停止，未提交生成');
   if(input.libtvOwnerKey&&input.libtvOwnerKey!==info.ownerKey)throw Error('此 LibTV 配置属于其他行舟账号，请重新连接');
   const label='行舟影视-'+input.kind+'-'+(input.id||crypto.randomUUID());
   const project=await command(id,['project','create',label],{signal:input.signal});const projectId=project.projectUuid||project.uuid||project.data?.projectUuid;
   if(typeof projectId!=='string'||!projectId)throw Error('LibTV 画布创建未确认，请到官网核对，未提交生成');
   const dir=path.join(session(id).dir,'references',input.id||crypto.randomUUID());fs.mkdirSync(dir,{recursive:true});const ids=[];
   for(const [index,ref] of (input.references||[]).entries()){
    if(!['image','video','audio'].includes(ref.kind))throw Error('LibTV 参考类型无效');let filePath=ref.filePath;
    if(!filePath){const ext={image:'png',video:'mp4',audio:'mp3'}[ref.kind];filePath=path.join(dir,index+'.'+ext);let bytes;if(readReference)bytes=await readReference(ref);else{const result=await require('./media-network.cjs').readMediaBytes(ref.url,{label:'LibTV 参考素材'});bytes=result.bytes;}fs.writeFileSync(filePath,bytes);}
    if(expected!==epoch||input.signal?.aborted)throw Error('LibTV 本机连接已停止，未提交生成');
    const uploaded=await command(id,['upload','参考-'+(index+1),'-p',projectId,'-t',ref.kind,'--resource',filePath],{signal:input.signal});const key=uploaded.nodeKey||uploaded.newNodeKey;if(!key)throw Error('LibTV 参考上传未确认，未提交生成');ids.push(key);
    if(!ref.filePath)fs.unlinkSync(filePath);
   }
   const args=['node','create',label,'-p',projectId,'-t',input.kind,'--prompt',params.prompt];
   for(const [key,value] of Object.entries(params))if(key!=='prompt')args.push('-s',key+'='+(typeof value==='object'?JSON.stringify(value):String(value)));
   for(const key of ids)args.push('--left',key);
   const created=await command(id,args,{signal:input.signal}),nodeId=created.nodeKey||created.newNodeKey;
   if(typeof nodeId!=='string'||!nodeId)throw Error('LibTV 节点创建未确认，未提交生成');
   const baseline=await command(id,['node',nodeId,'-p',projectId],{signal:input.signal});
   return{libtvOwnerKey:info.ownerKey,libtvIdentity:info.identity,libtvProjectId:projectId,libtvNodeId:nodeId,libtvCanvasUrl:taskUrl({libtvProjectId:projectId}),libtvInitialUrls:libtvResultURLs(baseline),jobId:nodeId};
   }finally{scope.runs--;}
  },
  async run(id,task,{signal}={}){const s=session(id);if(s.pendingLogin||s.switching)throw Error('LibTV 账号正在授权或切换，请稍后查询原任务');s.runs++;try{await authorizeTask(id,task);return await command(id,['node',task.libtvNodeId,'-p',task.libtvProjectId,'--run'],{signal});}finally{s.runs--;}},
  query,
  async download(id,task,destDir){const scope=session(id);if(scope.pendingLogin||scope.switching)throw Error('LibTV 账号正在切换，请稍后恢复原结果');scope.runs++;try{await authorizeTask(id,task);const dir=path.join(destDir,'libtv-'+task.id);fs.mkdirSync(dir,{recursive:true});await command(id,['download','-n',task.libtvNodeId,'-p',task.libtvProjectId,'-o',dir]);
   const mediaName=n=>task.kind==='image'?/\.(png|jpe?g|webp)$/i.test(n):/\.(mp4|webm|mov)$/i.test(n);
   let index=0,total=0;for(const archive of fs.readdirSync(dir).filter(n=>/\.zip$/i.test(n))){
    const zip=await require('jszip').loadAsync(fs.readFileSync(path.join(dir,archive)));for(const entry of Object.values(zip.files)){
     if(entry.dir||!mediaName(entry.name))continue;const original=entry.unsafeOriginalName||entry.name;
     if(/(?:^|[\\/])\.\.(?:[\\/]|$)|^[\\/]|:/.test(original)||index>=128)continue;
     const file=path.join(dir,`result-${index++}-`+path.basename(entry.name).replace(/[\\/:*?"<>|]/g,'_'));const temporary=file+'.tmp';
     const {Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
     await pipeline(entry.nodeStream(),new Transform({transform(chunk,encoding,done){total+=chunk.length;done(total>1024*1024*1024?Error('LibTV 结果解压大小超限'):null,chunk);}}),fs.createWriteStream(temporary));fs.renameSync(temporary,file);
    }
   }
   const files=fs.readdirSync(dir).filter(mediaName).map(n=>path.join(dir,n)).filter(file=>fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink());if(!files.length)throw Error('LibTV 结果尚未可下载，请打开原画布核对后刷新');return{filePath:files[0],files};}finally{scope.runs--;}},
  async close(){epoch++;for(const s of sessions.values())s.loginController?.abort();for(const child of children)child.kill();await new Promise(resolve=>{if(!children.size)return resolve();const timer=setTimeout(resolve,5000);let left=children.size;for(const child of children)child.once('close',()=>{if(!--left){clearTimeout(timer);resolve();}});});for(const s of sessions.values())if(!s.leases)seal(s);},
  hasRunning:()=>[...sessions.values()].some(s=>s.runs>0||s.leases>0||s.pendingLogin),
 };
}
module.exports={createLibTVService,parseCLIJSON,loginURL,installBinary,libtvResultURLs};
