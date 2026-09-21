const {createHash}=require('node:crypto');
const ACTIONS=new Set(['project-get','project-list','director-project-get','director-project-list']);
function createSnapshotCache({maxBytes=16*1024*1024}={}) {
  const entries=new Map(); let bytes=0;
  return {
    prepare(action,payload,token) {
      if(!ACTIONS.has(action)) return null;
      const key=createHash('sha256').update(JSON.stringify([token,action,payload])).digest('hex');
      const previous=entries.get(key);
      return {key,previous,headers:{'x-xingzhou-snapshot':'1',...(previous?{'x-xingzhou-known-revision':previous.revision}:{})}};
    },
    resolve(request,data) {
      if(!request || !data?._xzSnapshot) return data;
      const snapshot=data._xzSnapshot;
      if(snapshot.unchanged) {
        if(!request.previous || request.previous.revision!==snapshot.revision) throw Error('云端项目缓存失效，请刷新重试');
        return JSON.parse(request.previous.json);
      }
      const json=JSON.stringify(snapshot.value);
      if(typeof json!=='string' || !/^[a-f0-9]+$/.test(snapshot.revision || '')) throw Error('云端项目响应格式异常');
      const size=Buffer.byteLength(json);
      const old=entries.get(request.key);if(old){bytes-=old.size;entries.delete(request.key);}
      if(size<=maxBytes) {
        while(entries.size && (entries.size>=12 || bytes+size>maxBytes)) {
          const key=entries.keys().next().value;bytes-=entries.get(key).size;entries.delete(key);
        }
        entries.set(request.key,{json,revision:snapshot.revision,size});bytes+=size;
      }
      return JSON.parse(json);
    },
  };
}
module.exports={createSnapshotCache};
