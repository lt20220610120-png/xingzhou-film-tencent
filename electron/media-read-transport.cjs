// Chromium net.fetch rejects manual redirects in Electron. Use net.request's
// redirect event for media GETs so the caller can re-evaluate credentials per hop.
function createMediaReadFetch(net){return (url,options={})=>{
 if(options.redirect!=='manual')return net.fetch(url,options);
 return new Promise((resolve,reject)=>{let delivered=false,ended=false,bodyController;const request=net.request({url:String(url),method:'GET',redirect:'manual',useSessionCookies:false});
  const cleanup=()=>options.signal?.removeEventListener('abort',abort),abort=()=>{request.abort();if(!delivered)reject(options.signal?.reason||Error('媒体下载已取消'));cleanup();};
  if(options.signal?.aborted){abort();return;}options.signal?.addEventListener('abort',abort,{once:true});
  const fail=e=>{cleanup();if(!delivered)reject(e);else if(bodyController&&!ended){ended=true;bodyController.error(e);}};request.on('error',fail);
  request.on('redirect',(statusCode,_method,redirectUrl)=>{if(delivered)return;delivered=true;cleanup();resolve(new Response(null,{status:statusCode,headers:{location:redirectUrl}}));request.abort();});
  request.on('response',response=>{if(delivered)return;const headers=new Headers();for(const [key,value]of Object.entries(response.headers||{}))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):String(value));
   const stream=new ReadableStream({start(controller){bodyController=controller;response.on('data',chunk=>{if(!ended)controller.enqueue(new Uint8Array(chunk));});response.on('end',()=>{if(!ended){ended=true;cleanup();controller.close();}});response.on('error',e=>{if(!ended){ended=true;cleanup();controller.error(e);}});response.on('aborted',()=>{if(!ended){ended=true;cleanup();controller.error(Error('媒体下载连接中断'));}});},cancel(){ended=true;cleanup();request.abort();}});
   delivered=true;resolve(new Response(stream,{status:response.statusCode,headers}));
  });
  for(const [key,value]of Object.entries(options.headers||{}))request.setHeader(key,value);request.end();
 });
};}
module.exports={createMediaReadFetch};
