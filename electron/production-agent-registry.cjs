const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const definitions=[{id:'codex',name:'Codex',transport:'App Server',url:'https://developers.openai.com/codex/app-server/'},{id:'hermes',name:'Hermes',transport:'ACP + MCP',url:'https://hermes-agent.nousresearch.com/docs/user-guide/features/acp/'},{id:'cursor',name:'Cursor',transport:'ACP + MCP',url:'https://cursor.com/docs/cli/acp'},{id:'claude',name:'Claude Code',transport:'ACP 连接组件 + MCP',url:'https://github.com/zed-industries/claude-agent-acp'},{id:'acp',name:'其他 Agent · ACP',transport:'ACP + MCP',url:'https://agentclientprotocol.com/'}];
const first=values=>values.filter(Boolean).find(f=>fs.existsSync(f)&&fs.statSync(f).isFile())||'';
function fromPath(names,env){return first((env.PATH||env.Path||'').split(path.delimiter).flatMap(dir=>names.map(n=>path.join(dir,n))));}
function discoverAgents({home=os.homedir(),env=process.env}={}){
 const local=env.LOCALAPPDATA||path.join(home,'AppData','Local'),roaming=env.APPDATA||path.join(home,'AppData','Roaming');const bin=path.join(local,'OpenAI','Codex','bin');let codex='';if(fs.existsSync(bin))codex=first(fs.readdirSync(bin).map(n=>path.join(bin,n,'codex.exe')).sort((a,b)=>(fs.existsSync(b)?fs.statSync(b).mtimeMs:0)-(fs.existsSync(a)?fs.statSync(a).mtimeMs:0)));
 const hermes=first([path.join(local,'hermes','hermes-agent','venv','Scripts','hermes-acp.exe'),path.join(home,'.hermes','hermes-agent','venv','Scripts','hermes-acp.exe'),fromPath(['hermes-acp.exe'],env)]);
 const cursor=fromPath(['cursor-agent.exe','agent.exe'],env)||first([path.join(local,'cursor-agent','agent.exe'),path.join(local,'cursor-agent','cursor-agent.exe')]);
 let claude=fromPath(['claude-agent-acp.exe'],env);for(const base of [path.join(roaming,'npm','node_modules'),path.join(local,'npm','node_modules')]){const root=path.join(base,'@zed-industries','claude-agent-acp');try{const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),entry=typeof pkg.bin==='string'?pkg.bin:Object.values(pkg.bin||{})[0];if(entry&&fs.existsSync(path.join(root,entry)))claude=path.join(root,entry);}catch{}}
 const paths={codex:codex||fromPath(['codex.exe'],env),hermes,cursor,claude,acp:''};
 return definitions.map(d=>({...d,path:paths[d.id],installed:Boolean(paths[d.id])||(d.id==='cursor'&&fs.existsSync(path.join(local,'Cursor')))||(d.id==='claude'&&!!fromPath(['claude.exe'],env)),status:paths[d.id]?'component-found':d.id==='cursor'&&fs.existsSync(path.join(local,'Cursor'))?'desktop-only':'missing'}));
}
function resolveAgentLaunch(executable,protocol,cwd){
 if(protocol==='codex'||protocol==='acp')return {executable:require('./production-agent-path.cjs').resolveAgentExecutable(executable,protocol),args:protocol==='codex'?['app-server','--listen','stdio://']:[],cwd};
 if(!definitions.some(d=>d.id===protocol))throw Error('未知智能体类型');
 let selected=executable;if(protocol==='hermes'&&/Hermes\.exe$/i.test(selected||'')&&!/hermes-acp\.exe$/i.test(selected||'')){let dir=path.dirname(selected);for(let i=0;i<8;i++,dir=path.dirname(dir)){const candidate=path.join(dir,'venv','Scripts','hermes-acp.exe');if(fs.existsSync(candidate)){selected=candidate;break;}}}
 if(!selected||!fs.existsSync(selected)||!fs.statSync(selected).isFile())throw Error('未找到对应智能体连接组件，请先安装或选择连接组件');
 if(protocol==='claude'&&/\.(m?js)$/i.test(selected)){const node=first([fromPath(['node.exe'],process.env),path.join(process.env.ProgramFiles||'C:/Program Files','nodejs','node.exe'),...(!process.versions.electron?[process.execPath]:[])]);if(!node)throw Error('Claude ACP组件需要安装Node.js运行环境');return {executable:node,args:[selected],cwd};}
 if(!/\.exe$/i.test(selected))throw Error('请选择智能体可执行连接组件');
 if(protocol==='hermes'&&!/hermes-acp\.exe$/i.test(selected))throw Error('请选择Hermes的hermes-acp.exe，而不是桌面程序');
 if(protocol==='claude'&&!/claude-agent-acp\.exe$/i.test(selected))throw Error('Claude Code需要ACP连接组件，普通claude.exe不是ACP服务');
 return {executable:selected,args:protocol==='cursor'?['acp']:[],cwd};
}
module.exports={definitions,discoverAgents,resolveAgentLaunch};
