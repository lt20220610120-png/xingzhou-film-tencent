const {TRUSTED_MANIFEST_URL,validateManifest}=require('./update-trust.cjs');
function mirrorFor(url){
 const match=url.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
 return match?`https://cdn.jsdelivr.net/gh/${match[1]}/${match[2]}@${match[3]}/${match[4]}`:null;
}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function fetchUpdateManifest(url,{fetchFn=fetch,retries=2,sleep=wait,timeout=8000,verifyManifest=validateManifest,officialMirrors=[]}={}){
 if(!url?.startsWith('https://'))throw new Error('更新地址必须使用 HTTPS');
 if(url!==TRUSTED_MANIFEST_URL)throw new Error('只允许使用行舟官方更新清单');
 const sources=[...officialMirrors.filter(u=>['https://106.55.41.128/api/updates/latest.json','https://xingzhoufilm.cn/api/updates/latest.json'].includes(u)),url,mirrorFor(url)].filter(Boolean);
 for(const source of sources){
  for(let attempt=0;attempt<retries;attempt++){
   try{
    const response=await fetchFn(source,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(timeout)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const manifest=await response.json();
    if(!manifest?.version||!manifest?.installerUrl)throw new Error('更新清单格式不完整');
    return {manifest:verifyManifest(manifest),source};
   }catch(error){
    if(attempt+1<retries)await sleep(350*(attempt+1));
   }
  }
 }
 throw new Error('暂时无法连接更新服务器，请稍后重新检查');
}
module.exports={fetchUpdateManifest,mirrorFor};
