const {spawn}=require('node:child_process');const fs=require('node:fs');
const {readAgentStatus}=require('./production-agent-status.cjs');
/** JSON-lines transports; no shell interpolation and no copied login credentials. */
function createAgentClient({executable,protocol='codex',cwd,onEvent=()=>{},spawnProcess=spawn}){
 const launch=require('./production-agent-registry.cjs').resolveAgentLaunch(executable,protocol,cwd);executable=launch.executable;
 const child=spawnProcess(executable,launch.args,{cwd:launch.cwd,windowsHide:true,stdio:['pipe','pipe','pipe'],shell:false,...(launch.env?{env:launch.env}:{})});
 let acpSession=null,mcp=null,acpEditing=false;
 let serial=0,buffer='',closed=false;const toolSessions=new Map();const pending=new Map(),listeners=new Set();let stderr='';
 const fail=error=>{closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();listeners.forEach(fn=>fn({method:'disconnected',params:{message:error.message}}));};
 child.on('error',fail);child.on('exit',()=>fail(Error('Agent 连接已结束'+(stderr?'：'+stderr.slice(-200):''))));child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-2000);});
 const send=data=>{if(closed)throw Error('Agent 已断开');child.stdin.write(JSON.stringify(data)+'\n');};
 child.stdout.on('data',data=>{buffer+=data.toString();if(buffer.length>8*1024*1024){fail(Error('Agent 回包过大'));child.kill();return;}let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);let message;try{message=JSON.parse(line);}catch{continue;}
  if(message.id!==undefined&&pending.has(message.id)&&!message.method){const p=pending.get(message.id);pending.delete(message.id);clearTimeout(p.timer);message.error?p.reject(Error(message.error.message||'Agent 请求失败')):p.resolve(message.result);}
  else if(message.id!==undefined&&message.method){
   if(message.method==='item/tool/call'){
    const session=toolSessions.get(message.params?.threadId),tool=session?.tools.find(t=>t.name===message.params.tool);
    Promise.resolve().then(()=>{if(!tool||!session?.callTool)throw Error('此会话没有可调用的行舟工具');return session.callTool(message.params.tool,message.params.arguments);}).then(result=>send({id:message.id,result:{success:true,contentItems:[{type:'inputText',text:JSON.stringify(result)}]}}),error=>{if(!closed)send({id:message.id,result:{success:false,contentItems:[{type:'inputText',text:String(error.message)}]}});});continue;
   }
   if(message.method==='session/request_permission'&&message.params?.sessionId===acpSession?.sessionId&&acpEditing&&message.params.toolCall?.kind==='edit'){
    const path=require('node:path'),locations=message.params.toolCall.locations||[],option=message.params.options?.find(o=>o.kind==='allow_once');
    const within=file=>{try{if(!path.isAbsolute(file))return false;const root=fs.realpathSync(cwd),relative=path.relative(root,path.resolve(file));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))return false;let parent=path.resolve(file);while(!fs.existsSync(parent)){const next=path.dirname(parent);if(next===parent)return false;parent=next;}const real=path.relative(root,fs.realpathSync(parent));return !real.startsWith('..')&&!path.isAbsolute(real);}catch{return false;}};
    if(option&&locations.length&&locations.every(l=>typeof l.path==='string'&&within(l.path))){send({jsonrpc:'2.0',id:message.id,result:{outcome:{outcome:'selected',optionId:option.optionId}}});continue;}
   }
   // Requests needing interactive permission cannot silently grant arbitrary access.
   send({jsonrpc:'2.0',id:message.id,...(message.method==='session/request_permission'?{result:{outcome:{outcome:'cancelled'}}}:{error:{code:-32601,message:'当前连接需要用户在 Agent 中完成授权'}})});
   onEvent({method:'approval-required',params:{message:'Agent 需要交互授权，请处理后继续'}});
  }else{onEvent(message);listeners.forEach(fn=>fn(message));}
 }});
 function request(method,params,timeout=60000){return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`Agent ${method} 超时`));},timeout);pending.set(id,{resolve,reject,timer});try{send({jsonrpc:'2.0',id,method,params});}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});}
 return {
  async connect({status=false}={}){if(protocol==='codex'){await request('initialize',{clientInfo:{name:'xingzhou_film',title:'行舟影视制作工作流',version:'1.0.0'},capabilities:{experimentalApi:true}});send({method:'initialized'});const auth=await request('account/read',{});if(!auth.account)throw Error('请先在 Codex 中登录，再重新连接');const result=await request('model/list',{});return {connected:true,protocol,models:(result.data||[]).map(m=>({id:m.id,name:m.displayName||m.id})),...(status?{status:await readAgentStatus(request,auth.account,cwd)}:{})};}
   await request('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false},clientInfo:{name:'xingzhou-film',version:'1.0.0'}});const session=await request('session/new',{cwd,mcpServers:[]},120000);acpSession=session;return {connected:true,protocol,backendTransport:'MCP',currentModelId:session.models?.currentModelId||'',models:session.models?.availableModels?.map(m=>({id:m.modelId,name:m.name}))||[],sessionId:session.sessionId};},
  async run({model,prompt,edit=false,effort='high',tools=[],callTool}){
   if(protocol!=='codex'){
    acpEditing=edit;if(tools.length)mcp=await require('./production-agent-mcp.cjs').createAgentMcpServer({tools,callTool});
    try{const session=tools.length||!acpSession?await request('session/new',{cwd,mcpServers:mcp?[mcp.config]:[]},120000):acpSession;acpSession=session;
     if(model)await request('session/set_model',{sessionId:session.sessionId,modelId:model});let text='';const listener=m=>{if(m.method==='session/update'&&m.params?.sessionId===session.sessionId&&m.params.update?.sessionUpdate==='agent_message_chunk')text+=m.params.update.content?.text||'';};listeners.add(listener);
     try{const result=await request('session/prompt',{sessionId:session.sessionId,prompt:[{type:'text',text:prompt}]},60*60*1000);if(result?.stopReason==='cancelled')throw Error('智能体任务已取消');return text;}finally{listeners.delete(listener);}
    }finally{acpEditing=false;mcp?.close();mcp=null;}
   }
   // Internal production work must not populate the user's Codex chat history.
   const thread=await request('thread/start',{model,cwd,ephemeral:true,approvalPolicy:'on-request',sandbox:edit?'workspace-write':'read-only',...(tools.length?{dynamicTools:tools}:{})});
   if(thread.thread?.ephemeral!==true)throw Error('本机 Codex 未确认后台临时会话，请更新 Codex 后重试');
   const threadId=thread.thread.id;toolSessions.set(threadId,{tools,callTool});
   let text='';return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{done(Error('Agent 执行超时，已有项目文件保留'));},60*60*1000);
    const done=(error)=>{clearTimeout(timer);listeners.delete(listener);toolSessions.delete(threadId);error?reject(error):resolve(text);};
    const listener=m=>{if(m.method==='disconnected')return done(Error(m.params.message));if(m.params?.threadId!==threadId)return;
     if(m.method==='item/agentMessage/delta')text+=m.params.delta||'';
     if(m.method==='turn/completed'){const turn=m.params.turn;if(turn.status==='completed')done();else done(Error(turn.error?.message||'Agent 未完成任务'));}
    };listeners.add(listener);request('turn/start',{threadId,input:[{type:'text',text:prompt}],model,effort}).catch(done);
   });
  },close(){mcp?.close();mcp=null;if(!closed){if(protocol!=='codex'&&acpSession)try{send({jsonrpc:'2.0',method:'session/cancel',params:{sessionId:acpSession.sessionId}});}catch{}child.kill();fail(Error('Agent 已断开'));}}
 };
}
module.exports={createAgentClient};
