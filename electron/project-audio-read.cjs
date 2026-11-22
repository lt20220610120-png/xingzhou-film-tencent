async function readProjectAudio(request,url,scope,{readScope,cache,relay,local,fetchFn,onDirect=()=>{}}) {
  const cached=await cache.peek(url,scope);
  if(readScope()!==scope) return new Response(null,{status:403});
  const info=cached || (request.method==='GET'
    ? await cache.read(url,scope,()=>relay(url,scope,request.signal),{signal:request.signal}) : null);
  if(readScope()!==scope) return new Response(null,{status:403});
  if(info?.filePath) return local({
    url:'xzmedia://local/'+encodeURIComponent(info.filePath),method:request.method,headers:request.headers,signal:request.signal,
  });
  const range=request.headers.get('range');
  const source=await fetchFn(url,{
    method:request.method,headers:range?{Range:range}:{},redirect:'error',signal:request.signal,
  });
  if(readScope()!==scope) {
    await source.body?.cancel();
    return new Response(null,{status:403});
  }
  if(!source.body) return source;
  const length=Number(source.headers.get('content-length'));
  const mime=(source.headers.get('content-type')||'').split(';')[0].toLowerCase();
  const sampleRange=/^bytes 0-(\d+)\/(\d+)$/.exec(source.headers.get('content-range')||'');
  const whole=source.status===200 || (source.status===206 && sampleRange && Number(sampleRange[1])+1===length && Number(sampleRange[2])===length);
  const cacheable=whole && /^audio\//.test(mime) && length>0 && length<=16*1024*1024 && !source.headers.has('content-encoding');
  const chunks=[];
  let received=0;
  const copy=source.body.pipeThrough(new TransformStream({
    transform(chunk,controller) {
      if(readScope()!==scope) return controller.error(Error('账号已切换'));
      received+=chunk.length;
      if(cacheable && received<=length) chunks.push(Buffer.from(chunk));
      controller.enqueue(chunk);
    },
    async flush() {
      onDirect(received);
      if(cacheable && received===length && readScope()===scope) {
        await cache.read(url,scope,()=>({bytes:Buffer.concat(chunks,received),mime}));
      }
    },
  }));
  return new Response(copy,{status:source.status,statusText:source.statusText,headers:source.headers});
}
module.exports={readProjectAudio};
