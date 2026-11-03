const {spawn}=require('node:child_process');
function stopOwnedProcess(child,{platform=process.platform,spawnProcess=spawn}={}){
 if(!child||typeof child.kill!=='function')return false;
 if(platform==='win32'&&Number.isInteger(child.pid)&&child.pid>0){
 const killer=spawnProcess('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore',shell:false});
 killer.once('error',()=>{try{child.kill();}catch{}});return true;
 }
 try{return child.kill();}catch{return false;}
}
module.exports={stopOwnedProcess};
