const https = require('node:https');
const dns = require('node:dns');
const {Readable} = require('node:stream');

const MAX_RELAY_BYTES = 192 * 1024;
const projectMedia = /^\/projects\/([\w-]+)\/(?:image\/[\w.-]+\.(?:png|jpe?g|webp|gif)|audio\/[\w.-]+\.(?:wav|mp3|m4a|aac|ogg|flac))$/i;
const mimePattern = /^(?:image\/(?:png|jpeg|webp|gif)|audio\/(?:wav|x-wav|wave|mpeg|mp3|mp4|aac|x-aac|ogg|flac|x-flac))$/;
const isPrivate = address => /^(?:10\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.)/.test(address);

function fetchInternal(url, {headers,signal}) {
  return new Promise((resolve,reject)=>{
    const request = https.get(url,{
      headers,signal,family:4,agent:false,
      lookup(host,_options,callback) {
        dns.lookup(host,{family:4},(error,address,family)=>{
          if (error || !isPrivate(address)) return callback(error || Error('COS internal route unavailable'));
          callback(null,address,family);
        });
      },
    },response=>{
      resolve({status:response.statusCode,headers:new Headers(response.headers),body:Readable.toWeb(response)});
    });
    request.on('error',reject);
  });
}

function createSmallMediaRelay({signer, fetchFn=fetchInternal, timeoutMs=650, now=Date.now}) {
  let active = false;
  let nextStart = 0;
  const bypass = route => ({route});
  return async ({url},user,repository) => {
    const signed = signer.verifyProjectDownload(url);
    const project = signed?.pathname.match(projectMedia)?.[1];
    if (!project) return bypass('ineligible');
    if (active || now() < nextStart) return bypass('busy');
    active = true;
    try {
      const access = repository.getAssetImageProjectAccess || repository.getProject;
      if (!await access.call(repository,project,user.id)) return bypass('denied');
      const response = await fetchFn(signed.href,{
        headers:{Range:'bytes=0-'+(MAX_RELAY_BYTES-1)},
        signal:AbortSignal.timeout(timeoutMs),
      });
      const mime = (response.headers.get('content-type')||'').split(';')[0].toLowerCase();
      const length = Number(response.headers.get('content-length'));
      const range = /^bytes 0-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');
      if (response.status!==206 || !range || !mimePattern.test(mime)
        || !Number.isSafeInteger(length) || length<1 || length>MAX_RELAY_BYTES
        || Number(range[1])+1!==length || Number(range[2])!==length) {
        await response.body?.cancel().catch(()=>{});
        return bypass(range && Number(range[2])>MAX_RELAY_BYTES?'large':'unavailable');
      }
      const chunks = [];
      let received = 0;
      for await (const chunk of response.body) {
        received += chunk.length;
        if (received>length) return bypass('unavailable');
        chunks.push(chunk);
      }
      if (received!==length) return bypass('unavailable');
      // A global gap after a served body keeps bandwidth for interactive APIs.
      // At sustained load this lane stays under 125 GiB in a 31-day month.
      nextStart = now()+Math.max(1250,Math.ceil(received*1000/(48*1024)));
      return {route:'relay',mime,base64:Buffer.concat(chunks,received).toString('base64')};
    } catch {
      return bypass('unavailable');
    } finally {
      active = false;
    }
  };
}
module.exports={createSmallMediaRelay};
