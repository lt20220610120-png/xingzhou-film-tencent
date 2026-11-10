const fs=require('node:fs');
async function connection({configFile='D:/MuseCanvasData/install.json',fetchFn=fetch}={}){
 let config;try{config=JSON.parse(fs.readFileSync(configFile,'utf8'));}catch{throw Error('未找到本机 MuseCanvas 配置，请先启动 D 盘的 MuseCanvas');}
 const port=Number(config.ports?.pool);if(port!==18610||!config.poolKey)throw Error('本机 Muse 号池配置不完整或端口不是18610');
 const endpoint='http://127.0.0.1:18610/v1';let response;
 try{response=await fetchFn(endpoint+'/models',{headers:{Authorization:'Bearer '+config.poolKey},signal:AbortSignal.timeout(10000),redirect:'error'});}catch{throw Error('Muse 号池未启动，请先双击桌面 MuseCanvas，再连接');}
 if(!response.ok)throw Error('Muse 号池鉴权失败，请检查原 MuseCanvas 实例');
 const data=await response.json();const models=(data.data||[]).filter(m=>['muse-image','muse-video'].includes(m.id)).map(m=>({id:m.id,name:m.id,kind:m.id==='muse-image'?'image':'video'}));
 if(models.length!==2)throw Error('当前号池未返回 Muse 图片和视频模型');
 return {endpoint,apiKey:config.poolKey,models};
}
module.exports={connection};
