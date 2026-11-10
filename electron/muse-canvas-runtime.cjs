const videoScript=`if(videos.length||audios.length)throw Error('当前 Muse 适配仅支持图片参考');
const task=await http.post('/v1/videos',{model:'muse-video',prompt,images,duration:Number(params.seconds)||5,seconds:Number(params.seconds)||5,size:params.ratio||'16:9'});
if(!task.id)throw Error('Muse 未返回任务编号，请核对号池任务，避免重复提交');
return await poll(()=>http.get('/v1/videos/'+encodeURIComponent(task.id)),r=>{if(['failed','error','cancelled'].includes(r.status))throw Error(r.error?.message||r.error||'Muse 视频失败');if(!['succeeded','completed'].includes(r.status))return null;return http.get('/v1/videos/'+encodeURIComponent(task.id)+'/content',{responseType:'blob'});},{intervalMs:5000,timeoutMs:1200000});`;
const imageScript=`const r=await http.post('/v1/images/generations',{model:'muse-image',prompt,images,size:params.size||'1:1',n:1,response_format:'url'});return r.data;`;
function canvasRuntime(profile){
 if(!profile)return 'window.__RUNTIME_CONFIG__ = window.__RUNTIME_CONFIG__ || {};';
 const channel={id:'xingzhou-muse-local',name:'Muse 本机号池',baseUrl:'http://127.0.0.1:18610',apiKey:profile.apiKey,apiFormat:'openai',models:[{name:'muse-image',capability:'image',script:imageScript},{name:'muse-video',capability:'video',script:videoScript}]};
 return `window.__RUNTIME_CONFIG__=window.__RUNTIME_CONFIG__||{};(()=>{try{const key='infinite-canvas:ai_config_store',saved=JSON.parse(localStorage.getItem(key)||'{}');saved.state=saved.state||{};const config=saved.state.config=saved.state.config||{};const channel=${JSON.stringify(channel)};const channels=Array.isArray(config.channels)?config.channels:[];config.channels=[...channels.filter(c=>c.id!==channel.id),channel];localStorage.setItem(key,JSON.stringify(saved));}catch(error){console.error('本机 Muse 渠道配置未更新');}})();`;
}
module.exports={canvasRuntime,videoScript,imageScript};
