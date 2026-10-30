const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function resolveAgentExecutable(executable,protocol='codex',bin=path.join(os.homedir(),'AppData','Local','OpenAI','Codex','bin')){
 const valid=file=>typeof file==='string'&&/\.exe$/i.test(file)&&fs.existsSync(file)&&fs.statSync(file).isFile();
 if(valid(executable))return executable;
 if(protocol==='codex'&&path.basename(String(executable||'')).toLowerCase()==='codex.exe'&&fs.existsSync(bin)){
  const candidates=fs.readdirSync(bin,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(bin,e.name,'codex.exe')).filter(valid).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);if(candidates[0])return candidates[0];
 }throw Error('请选择实际 Agent .exe 连接组件');
}
module.exports={resolveAgentExecutable};
