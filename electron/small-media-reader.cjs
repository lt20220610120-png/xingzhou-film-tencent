const {cacheIdentity}=require('./cos-image-cache.cjs');

function createSmallMediaReader({call,getToken,now=Date.now,onRead=()=>{}}) {
  let active=false, retryAt=0;
  return async (url,account,signal)=>{
    if(active || now()<retryAt || signal?.aborted || !cacheIdentity(url,account)) return null;
    const token=getToken();
    if(!token) return null;
    active=true;
    try {
      const result=await call('media-read-small',{url},token,{singleAttempt:true,timeoutMs:1700});
      if(result?.route==='relay' && typeof result.base64==='string' && result.base64.length<=256*1024
        && /^(?:image|audio)\/[\w+-]+$/.test(result.mime)) {
        const bytes=Buffer.from(result.base64,'base64');
        if(bytes.length) {
          onRead('relay',bytes.length);
          return {bytes,mime:result.mime};
        }
      }
      if(result?.route==='busy') retryAt=now()+1000;
      if(result?.route==='disabled') retryAt=now()+30000;
    } catch { retryAt=now()+30000; }
    finally { active=false; }
    return null;
  };
}
module.exports={createSmallMediaReader};
