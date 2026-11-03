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
function stamp(file){try{return fs.statSync(file).mtimeMs;}catch{return 0;}}
function desktopProfile(roaming,names){
 const dir=path.join(roaming,'Hermes','Local Storage','leveldb'),marker='hermes-desktop-active-profile-v1';let files=[];try{files=fs.readdirSync(dir).filter(n=>/\.(?:log|ldb)$/i.test(n)).map(n=>path.join(dir,n)).sort((a,b)=>stamp(b)-stamp(a));}catch{return '';}
 for(const file of files){let raw='';try{raw=fs.readFileSync(file,'latin1');}catch{continue;}let found='',at=0;while((at=raw.indexOf(marker,at))>=0){let i=at+marker.length,end=Math.min(raw.length,i+5);while(i<end&&raw.charCodeAt(i)!==1)i++;if(i>=end){at+=marker.length;continue;}let candidate='';for(i++;i<raw.length&&candidate.length<64;i++){const c=raw.charCodeAt(i);if(!(c>=48&&c<=57||c>=65&&c<=90||c>=97&&c<=122||[46,45,95].includes(c)))break;candidate+=raw[i];}if(candidate&&names.includes(candidate))found=candidate;at+=marker.length;}if(found)return found;}
 return '';
}
function profileHome(root,name){return name==='default'?root:path.join(root,'profiles',name);}
function detectedHermesProfile({home=os.homedir(),env=process.env,now=Date.now()}={}){
 const local=env.LOCALAPPDATA||path.join(home,'AppData','Local'),roaming=env.APPDATA||path.join(home,'AppData','Roaming'),defaultRoot=path.join(local,'hermes');const inherited=String(env.HERMES_HOME||'').trim();let root=defaultRoot;if(inherited&&fs.existsSync(inherited)){const parent=path.dirname(inherited);root=path.basename(parent).toLowerCase()==='profiles'?path.dirname(parent):inherited;}
 let names=['default'];try{names.push(...fs.readdirSync(path.join(root,'profiles'),{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.name.startsWith('.')).map(e=>e.name));}catch{}
 const requested=String(env.HERMES_PROFILE||'').trim();if(requested&&names.includes(requested))return {profile:requested,home:profileHome(root,requested)};
 const desktop=desktopProfile(roaming,names);if(desktop)return {profile:desktop,home:profileHome(root,desktop)};
 try{const file=path.join(roaming,'Hermes','active-profile.json'),raw=JSON.parse(fs.readFileSync(file,'utf8')),name=String(raw.profile||'').trim();if(name&&names.includes(name)&&stamp(file)>=now-24*60*60*1000)return {profile:name,home:profileHome(root,name)};}catch{}
 const evidence=names.map(name=>{const dir=profileHome(root,name);const updated=Math.max(...['config.yaml','provider_models_cache.json','auth.json'].map(f=>stamp(path.join(dir,f))),0);return {profile:name,home:dir,updated};}).sort((a,b)=>b.updated-a.updated);
 if(evidence[0]?.updated)return evidence[0];if(inherited&&fs.existsSync(inherited))return {profile:'default',home:inherited};return {profile:'default',home:root};
}
function resolveAgentLaunch(executable,protocol,cwd,options={}){
 if(protocol==='codex'||protocol==='acp')return {executable:require('./production-agent-path.cjs').resolveAgentExecutable(executable,protocol),args:protocol==='codex'?['app-server','--listen','stdio://']:[],cwd};
 if(!definitions.some(d=>d.id===protocol))throw Error('未知智能体类型');
 let selected=executable;if(protocol==='hermes'&&/Hermes\.exe$/i.test(selected||'')&&!/hermes-acp\.exe$/i.test(selected||'')){let dir=path.dirname(selected);for(let i=0;i<8;i++,dir=path.dirname(dir)){const candidate=path.join(dir,'venv','Scripts','hermes-acp.exe');if(fs.existsSync(candidate)){selected=candidate;break;}}}
 if(!selected||!fs.existsSync(selected)||!fs.statSync(selected).isFile())throw Error('未找到对应智能体连接组件，请先安装或选择连接组件');
 if(protocol==='claude'&&/\.(m?js)$/i.test(selected)){const node=first([fromPath(['node.exe'],process.env),path.join(process.env.ProgramFiles||'C:/Program Files','nodejs','node.exe'),...(!process.versions.electron?[process.execPath]:[])]);if(!node)throw Error('Claude ACP组件需要安装Node.js运行环境');return {executable:node,args:[selected],cwd};}
 if(!/\.exe$/i.test(selected))throw Error('请选择智能体可执行连接组件');
 if(protocol==='hermes'&&!/hermes-acp\.exe$/i.test(selected))throw Error('请选择Hermes的hermes-acp.exe，而不是桌面程序');
 if(protocol==='claude'&&!/claude-agent-acp\.exe$/i.test(selected))throw Error('Claude Code需要ACP连接组件，普通claude.exe不是ACP服务');
 if(protocol==='hermes'){const detected=detectedHermesProfile(options);return {executable:selected,args:[],cwd,profile:detected.profile,env:{...process.env,HERMES_HOME:detected.home}};}
 return {executable:selected,args:protocol==='cursor'?['acp']:[],cwd};
}
module.exports={definitions,discoverAgents,resolveAgentLaunch,detectedHermesProfile};
