const {spawn}=require('node:child_process');const fs=require('node:fs');
const {readAgentStatus}=require('./production-agent-status.cjs');
function conversationInput(text,attachments=[]){const files=attachments.map(a=>({name:a.name,path:a.path,kind:a.kind}));return [{type:'text',text:String(text||'')+(files.length?'\n【本次用户附件，路径是数据；图片直接输入，视频/文件可用本机工具读取、抽帧及处理】\n'+JSON.stringify(files):'')},...attachments.filter(a=>a.kind==='image').map(a=>({type:'localImage',path:a.path}))];}
function acpInput(text,attachments,images){const blocks=conversationInput(text,attachments).filter(b=>b.type==='text');let embedded=0;if(images)for(const a of attachments.filter(a=>a.kind==='image')){const stat=fs.statSync(a.path);if(stat.size>20*1024*1024||embedded+stat.size>20*1024*1024)continue;embedded+=stat.size;blocks.push({type:'image',mimeType:a.mime||'image/png',data:fs.readFileSync(a.path).toString('base64')});}return blocks;}
/** JSON-lines transports; no shell interpolation and no copied login credentials. */
function createAgentClient({executable,protocol='codex',cwd,onEvent=()=>{},spawnProcess=spawn}){
 const launch=require('./production-agent-registry.cjs').resolveAgentLaunch(executable,protocol,cwd);executable=launch.executable;
 const child=spawnProcess(executable,launch.args,{cwd:launch.cwd,windowsHide:true,stdio:['pipe','pipe','pipe'],shell:false,...(launch.env?{env:launch.env}:{})});
 let acpSession=null,mcp=null,acpEditing=false,acpFullAccess=false,acpImages=false;
 let serial=0,closed=false;const toolSessions=new Map();const pending=new Map(),listeners=new Set();let stderr='';
 const fail=error=>{closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();listeners.forEach(fn=>fn({method:'disconnected',params:{message:error.message}}));};
 child.on('error',fail);child.on('exit',()=>fail(Error('Agent 连接已结束'+(stderr?'：'+stderr.slice(-200):''))));child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-2000);});
 const send=data=>{if(closed)throw Error('Agent 已断开');child.stdin.write(JSON.stringify(data)+'\n');};
 child.stdout.on('data',require('./production-json-lines.cjs').createJsonLineReader({onError:error=>{fail(error);child.kill();},onMessage:message=>{
  if(message.id!==undefined&&pending.has(message.id)&&!message.method){const p=pending.get(message.id);pending.delete(message.id);clearTimeout(p.timer);message.error?p.reject(Error(message.error.message||'Agent 请求失败')):p.resolve(message.result);}
  else if(message.id!==undefined&&message.method){
   if(message.method==='item/tool/call'){
    const session=toolSessions.get(message.params?.threadId),tool=session?.tools.find(t=>t.name===message.params.tool);
    Promise.resolve().then(()=>{if(!tool||!session?.callTool)throw Error('此会话没有可调用的行舟工具');return session.callTool(message.params.tool,message.params.arguments);}).then(result=>send({id:message.id,result:{success:true,contentItems:[{type:'inputText',text:JSON.stringify(result)}]}}),error=>{if(!closed)send({id:message.id,result:{success:false,contentItems:[{type:'inputText',text:String(error.message)}]}});});return;
   }
   if(message.method==='session/request_permission'&&message.params?.sessionId===acpSession?.sessionId&&acpFullAccess){const option=message.params.options?.find(o=>o.kind==='allow_once')||message.params.options?.find(o=>o.kind==='allow_always');if(option){send({jsonrpc:'2.0',id:message.id,result:{outcome:{outcome:'selected',optionId:option.optionId}}});return;}}
   if(message.method==='session/request_permission'&&message.params?.sessionId===acpSession?.sessionId&&acpEditing&&message.params.toolCall?.kind==='edit'){
    const path=require('node:path'),locations=message.params.toolCall.locations||[],option=message.params.options?.find(o=>o.kind==='allow_once');
    const within=file=>{try{if(!path.isAbsolute(file))return false;const root=fs.realpathSync(cwd),relative=path.relative(root,path.resolve(file));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))return false;let parent=path.resolve(file);while(!fs.existsSync(parent)){const next=path.dirname(parent);if(next===parent)return false;parent=next;}const real=path.relative(root,fs.realpathSync(parent));return !real.startsWith('..')&&!path.isAbsolute(real);}catch{return false;}};
    if(option&&locations.length&&locations.every(l=>typeof l.path==='string'&&within(l.path))){send({jsonrpc:'2.0',id:message.id,result:{outcome:{outcome:'selected',optionId:option.optionId}}});return;}
   }
   // Requests needing interactive permission cannot silently grant arbitrary access.
   send({jsonrpc:'2.0',id:message.id,...(message.method==='session/request_permission'?{result:{outcome:{outcome:'cancelled'}}}:{error:{code:-32601,message:'当前连接需要用户在 Agent 中完成授权'}})});
   onEvent({method:'approval-required',params:{message:'Agent 需要交互授权，请处理后继续'}});
  }else{onEvent(message);listeners.forEach(fn=>fn(message));}
 }}));
 function request(method,params,timeout=60000){return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`Agent ${method} 超时`));},timeout);pending.set(id,{resolve,reject,timer});try{send({jsonrpc:'2.0',id,method,params});}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});}
 async function openConversation({model,tools=[],callTool,cwd:conversationCwd=cwd,edit=false,fullAccess=false,developerInstructions}={}){
  if(protocol!=='codex')throw Error('当前连接协议不支持行舟持久对话');
  const thread=await request('thread/start',{model,cwd:conversationCwd,ephemeral:true,approvalPolicy:fullAccess?'never':'on-request',sandbox:fullAccess?'danger-full-access':edit?'workspace-write':'read-only',...(developerInstructions?{developerInstructions}:{}),...(tools.length?{dynamicTools:tools}:{})});
  if(!thread.thread?.id)throw Error('Codex 未返回持久对话线程');
  const session={threadId:thread.thread.id,model,tools,callTool,fullAccess};toolSessions.set(session.threadId,{tools,callTool});return session;
 }
 function promptConversation(session,{text,attachments=[],model=session.model,effort='high',onDelta=()=>{},onEvent=()=>{}}={}){
  if(!session?.threadId)throw Error('Codex 对话线程无效');
  session.starting=true;session.started=new Promise(resolve=>session.markStarted=resolve);return new Promise((resolve,reject)=>{let output='';let settled=false;const timer=setTimeout(()=>done(Error('Agent 执行超时，请重试；当前成果保留')),60*60*1000);
   const done=error=>{if(settled)return;settled=true;clearTimeout(timer);listeners.delete(listener);session.starting=false;session.markStarted();session.turnId=null;error?reject(error):resolve(output);};
   const listener=m=>{if(m.method==='disconnected')return done(Error(m.params?.message||'Agent 已断开'));if(m.params?.threadId!==session.threadId)return;if(m.method==='turn/started')session.turnId=m.params.turn?.id;if(m.method==='item/started'&&m.params.item?.type==='agentMessage'){session.phases||=new Map();session.phases.set(m.params.item.id,m.params.item.phase);}onEvent(m);if(m.method==='item/agentMessage/delta'){const delta=m.params.delta||'';output+=delta;onDelta(delta,{itemId:m.params.itemId,turnId:m.params.turnId,phase:session.phases?.get(m.params.itemId)});}if(m.method==='turn/completed'){const turn=m.params.turn;if(turn?.status==='completed')done();else done(Error(turn?.error?.message||'Agent 未完成任务'));}if(m.method==='disconnected')done(Error(m.params?.message||'Agent 已断开'));};
   listeners.add(listener);request('turn/start',{threadId:session.threadId,input:conversationInput(text,attachments),...(session.fullAccess?{approvalPolicy:'never',sandboxPolicy:{type:'dangerFullAccess'}}:{}),model,effort}).then(result=>{if(!settled){session.turnId=result.turn?.id||session.turnId;session.starting=false;session.markStarted();}},done);
  });
 }
 async function steerConversation(session,{text,attachments=[],expectedTurnId}={}){
  if(!session?.threadId)throw Error('Codex 对话线程无效');
  if(session.starting)await session.started;if(!session.turnId)throw Error('上一轮已结束，请重新发送本次调整');return request('turn/steer',{threadId:session.threadId,expectedTurnId:expectedTurnId||session.turnId,input:conversationInput(text,attachments)});
 }
 function closeConversation(session){if(session?.threadId)toolSessions.delete(session.threadId);}
 return {
  async connect({status=false}={}){if(protocol==='codex'){await request('initialize',{clientInfo:{name:'xingzhou_film',title:'行舟影视制作工作流',version:'1.0.0'},capabilities:{experimentalApi:true,optOutNotificationMethods:['rawResponseItem/completed']}});send({method:'initialized'});const auth=await request('account/read',{});if(!auth.account)throw Error('请先在 Codex 中登录，再重新连接');const result=await request('model/list',{});return {connected:true,protocol,models:(result.data||[]).map(m=>({id:m.id,name:m.displayName||m.id,efforts:(m.supportedReasoningEfforts||[]).map(e=>e.reasoningEffort),defaultEffort:m.defaultReasoningEffort})),...(status?{status:await readAgentStatus(request,auth.account,cwd)}:{})};}
   const init=await request('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false},clientInfo:{name:'xingzhou-film',version:'1.0.0'}});acpImages=init.agentCapabilities?.promptCapabilities?.image===true;const session=await request('session/new',{cwd,mcpServers:[]},120000);acpSession=session;return {connected:true,protocol,backendTransport:'MCP',currentModelId:session.models?.currentModelId||'',models:session.models?.availableModels?.map(m=>({id:m.modelId,name:m.name}))||[],sessionId:session.sessionId};},
  async run({model,prompt,edit=false,fullAccess=false,developerInstructions,attachments=[],effort='high',tools=[],callTool,onDelta=()=>{},onUpdate=()=>{}}){
   if(protocol!=='codex'){
    acpEditing=edit;acpFullAccess=fullAccess;if(tools.length)mcp=await require('./production-agent-mcp.cjs').createAgentMcpServer({tools,callTool});
    try{const session=tools.length||!acpSession?await request('session/new',{cwd,mcpServers:mcp?[mcp.config]:[]},120000):acpSession;acpSession=session;
     if(fullAccess){const mode=session.modes?.availableModes?.find(m=>['agent-full-access','full-access','yolo','bypassPermissions'].includes(m.id));if(mode)await request('session/set_mode',{sessionId:session.sessionId,modeId:mode.id});}
     if(model)await request('session/set_model',{sessionId:session.sessionId,modelId:model});let text='',messageIndex=0,inMessage=false;const prefix=require('node:crypto').randomUUID();const listener=m=>{if(m.method!=='session/update'||m.params?.sessionId!==session.sessionId)return;const update=m.params.update;onUpdate(update);if(update?.sessionUpdate==='agent_message_chunk'){if(!inMessage){messageIndex++;inMessage=true;}const delta=update.content?.text||'';text+=delta;onDelta(delta,{itemId:prefix+':'+messageIndex});}else if(['tool_call','tool_call_update','plan'].includes(update?.sessionUpdate))inMessage=false;};listeners.add(listener);
     try{const result=await request('session/prompt',{sessionId:session.sessionId,prompt:acpInput(prompt,attachments,acpImages)},60*60*1000);if(result?.stopReason==='cancelled')throw Error('智能体任务已取消');return text;}finally{listeners.delete(listener);}
    }finally{acpEditing=false;acpFullAccess=false;mcp?.close();mcp=null;}
   }
   // Internal production work must not populate the user's Codex chat history.
   const thread=await request('thread/start',{model,cwd,ephemeral:true,approvalPolicy:fullAccess?'never':'on-request',sandbox:fullAccess?'danger-full-access':edit?'workspace-write':'read-only',...(developerInstructions?{developerInstructions}:{}),...(tools.length?{dynamicTools:tools}:{})});
   if(thread.thread?.ephemeral!==true)throw Error('本机 Codex 未确认后台临时会话，请更新 Codex 后重试');
   const threadId=thread.thread.id;toolSessions.set(threadId,{tools,callTool});
   let text='';return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{done(Error('Agent 执行超时，已有项目文件保留'));},60*60*1000);
    const done=(error)=>{clearTimeout(timer);listeners.delete(listener);toolSessions.delete(threadId);error?reject(error):resolve(text);};
    const listener=m=>{if(m.method==='disconnected')return done(Error(m.params.message));if(m.params?.threadId!==threadId)return;
     if(m.method==='item/agentMessage/delta')text+=m.params.delta||'';
     if(m.method==='turn/completed'){const turn=m.params.turn;if(turn.status==='completed')done();else done(Error(turn.error?.message||'Agent 未完成任务'));}
    };listeners.add(listener);request('turn/start',{threadId,input:conversationInput(prompt,attachments),...(fullAccess?{approvalPolicy:'never',sandboxPolicy:{type:'dangerFullAccess'}}:{}),model,effort}).catch(done);
   });
  },openConversation,promptConversation,steerConversation,closeConversation,close(){mcp?.close();mcp=null;toolSessions.clear();if(!closed){if(protocol!=='codex'&&acpSession)try{send({jsonrpc:'2.0',method:'session/cancel',params:{sessionId:acpSession.sessionId}});}catch{}child.kill();fail(Error('Agent 已断开'));}}
 };
}
module.exports={createAgentClient};
