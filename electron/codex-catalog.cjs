const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createAgentClient}=require('./production-agent.cjs');
const {findCodexCommand}=require('./codex-local.cjs');

// Start a fresh app-server on every refresh so its catalog follows the installed
// Codex and current account. Only presentation fields cross IPC; no auth files.
async function readLocalCodexCatalog({signal,createClient=createAgentClient}={}){
 if(signal?.aborted)throw Error('账号状态已变化，请重新连接');
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-codex-catalog-'));
 let client;
 const abort=()=>client?.close();
 try{
  client=createClient({executable:findCodexCommand().executable,protocol:'codex',cwd,
   spawnProcess:(executable,args,options)=>{
    const env={...process.env};
    for(const key of ['OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN','OPENAI_BASE_URL'])delete env[key];
    return spawn(executable,args,{...options,env});
   }});
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)throw Error('账号状态已变化，请重新连接');
  const result=await client.connect({status:'account',chatgptOnly:true});
  if(signal?.aborted)throw Error('账号状态已变化，请重新连接');
  if(!result.models?.length)throw Error('Codex 未返回可用模型，请更新本机 Codex 并重新连接');
  return {models:result.models,account:result.status?.account||null,windows:result.status?.windows||[],
   quotaError:result.status?.errors?.limits||'',checkedAt:Date.now()};
 }finally{
  signal?.removeEventListener('abort',abort);
  client?.close();await fs.promises.rm(cwd,{recursive:true,force:true,maxRetries:20,retryDelay:100});
 }
}
module.exports={readLocalCodexCatalog};
