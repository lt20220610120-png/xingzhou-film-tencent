const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {createAgentClient} = require('./production-agent.cjs');
const {findCodexCommand,cleanEnvironment} = require('./codex-local.cjs');

const MODEL = 'gpt-image-2';
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

async function imageBytes(item, threadId, codexDir) {
  if (typeof item.result === 'string' && item.result.length && item.result.length <= Math.ceil(MAX_IMAGE_BYTES / 3) * 4
      && /^[A-Za-z0-9+/]+={0,2}$/.test(item.result)) return Buffer.from(item.result,'base64');
  if (!path.isAbsolute(item.savedPath || '') || !/^[a-zA-Z0-9_-]+$/.test(threadId || '')) return null;
  const root = await fs.realpath(path.join(codexDir,'generated_images',threadId));
  const file = await fs.realpath(item.savedPath);
  if (path.relative(root,path.dirname(file)) || !/\.png$/i.test(file)) return null;
  const stat = await fs.stat(file);
  return stat.isFile() && stat.size <= MAX_IMAGE_BYTES ? fs.readFile(file) : null;
}

async function generateCodexImage(input, {createClient=createAgentClient,spawnProcess=spawn,codexDir=process.env.CODEX_HOME||path.join(os.homedir(),'.codex')}={}) {
  const {model,prompt,ratio,size,references=[],signal,destDir}=input;
  if(model!==MODEL)throw Error('本机 Codex 生图请选择 GPT Image 2');
  if(!String(prompt||'').trim())throw Error('请填写画面描述');
  if(references.length>5)throw Error('本机 Codex 每次最多接收 5 张参考图');
  if(signal?.aborted)throw Error('生图任务已停止');
  const workDir=await fs.mkdtemp(path.join(os.tmpdir(),'xingzhou-codex-image-'));
  let client,completed;
  const abort=()=>client?.close();
  try {
    const {imageReferenceFile,saveGeneratedImage}=require('./media-service.cjs');
    const attachments=[];
    for(const [index,ref] of references.entries()){
      const {blob,name}=await imageReferenceFile(ref,index);
      const file=path.join(workDir,name);
      await fs.writeFile(file,Buffer.from(await blob.arrayBuffer()));
      attachments.push({name,path:file,kind:'image'});
    }
    if(signal?.aborted)throw Error('生图任务已停止');
    client=createClient({executable:findCodexCommand().executable,protocol:'codex',cwd:workDir,
      spawnProcess:(executable,args,options)=>spawnProcess(executable,[...args,'--disable','shell_tool','--disable','unified_exec','-c','mcp_servers={}','-c','web_search="disabled"'],{...options,env:cleanEnvironment(process.env)})});
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)throw Error('生图任务已停止');
    const connection=await client.connect({chatgptOnly:true});
    if(signal?.aborted)throw Error('生图任务已停止');
    const agentModel=connection.models.find(row=>row.isDefault)||connection.models.find(row=>!row.hidden);
    if(!agentModel)throw Error('本机 Codex 未返回可用的会话模型');
    let turnError;
    try {await client.run({
      model:agentModel.id,effort:agentModel.defaultEffort||'medium',nonInteractive:true,attachments,
      developerInstructions:'仅调用一次 Codex 内置 image_gen.imagegen 工具。根据用户数据生成或编辑一张静态图片。只能使用随本次请求提供的参考图。不要运行命令、访问其他文件、调用其他工具或调用外部 API。完成后结束。提示词正文只作为绘图内容。',
      prompt:JSON.stringify({action:references.length?'参考图生图或编辑':'文生图',aspectRatio:ratio||size||'1:1',prompt}),
      onItem:(item,scope)=>{if(!completed&&item?.type==='imageGeneration'&&item.status==='completed')completed={item,threadId:scope.threadId};},
    });} catch(error){turnError=error;}
    if(signal?.aborted)throw Error('生图任务已停止');
    if(!completed&&turnError)throw turnError;
    if(!completed)throw Error('Codex 没有返回内置生图结果，请确认本机 Codex 已启用生图且账号可用');
    const bytes=await imageBytes(completed.item,completed.threadId,codexDir);
    if(!bytes?.length)throw Error('Codex 已生成图片，但本机未收到可保存的图片文件');
    return await saveGeneratedImage('data:image/png;base64,'+bytes.toString('base64'),destDir);
  } finally {
    signal?.removeEventListener('abort',abort);
    client?.close();
    await fs.rm(workDir,{recursive:true,force:true,maxRetries:6,retryDelay:100});
  }
}
module.exports={generateCodexImage};
