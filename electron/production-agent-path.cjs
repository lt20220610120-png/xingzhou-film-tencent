const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function valid(file){return typeof file==='string'&&/\.exe$/i.test(file)&&fs.existsSync(file)&&fs.statSync(file).isFile();}
function timestamp(file){try{return fs.statSync(file).mtimeMs;}catch{return 0;}}
function newest(files){return files.filter(valid).sort((a,b)=>timestamp(b)-timestamp(a)||a.localeCompare(b))[0]||'';}
function versionedCodex(bin){try{return fs.readdirSync(bin,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(bin,e.name,'codex.exe'));}catch{return [];}}
function latestCodexExecutable(bin=path.join(os.homedir(),'AppData','Local','OpenAI','Codex','bin'),home=os.homedir()){
 const route=path.join(home,'.codex','route-switch','compat');
 let routed=[];try{routed=fs.readdirSync(route,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(route,e.name,'runtime','resources','codex.exe'));}catch{}
 return newest([...versionedCodex(bin),...routed]);
}
function managedCodexPath(file,bin,home){if(!file)return false;const abs=path.resolve(file);for(const root of [path.resolve(bin),path.resolve(home,'.codex','route-switch','compat')]){const rel=path.relative(root,abs);if(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel))return true;}return false;}
function resolveAgentExecutable(executable,protocol='codex',bin=path.join(os.homedir(),'AppData','Local','OpenAI','Codex','bin'),home=os.homedir()){
 const latest=latestCodexExecutable(bin,home);
 if(protocol==='codex'&&path.basename(String(executable||'')).toLowerCase()==='codex.exe'){
  if(!valid(executable)||managedCodexPath(executable,bin,home))return latest||executable;
  return executable;
 }
 if(valid(executable))return executable;
 if(protocol==='codex'&&latest)return latest;
 throw Error('请选择实际 Agent .exe 连接组件');
}
module.exports={resolveAgentExecutable,latestCodexExecutable};
