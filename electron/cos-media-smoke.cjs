const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');

module.exports=async root=>{
  const {nativeImage,session}=require('electron');
  const {createCosImageCache,COS_HOST}=require('./cos-image-cache.cjs');
  const {createAssetImagePreview}=require('./asset-image-preview.cjs');
  const {createNineyReferenceUploader}=require('./niney-reference-upload.cjs');
  const {createSmallMediaReader}=require('./small-media-reader.cjs');
  const {compressReferenceImage}=require('./reference-image-copy.cjs');
  const {readProjectAudio}=require('./project-audio-read.cjs');
  const {createLocalMediaHandler}=require('./local-media.cjs');
  const {uploadToBucket}=require('./collab-service.cjs');
  const width=1600,height=1200,bitmap=Buffer.alloc(width*height*4);
  let random=17;
  for(let i=0;i<bitmap.length;i+=4) {
    random=(Math.imul(random,1664525)+1013904223)>>>0;
    const noise=16+(random>>>26), x=(i/4)%width, y=Math.floor(i/(4*width));
    bitmap[i]=(x*0.11+noise)&255;bitmap[i+1]=(y*0.15+noise)&255;
    bitmap[i+2]=((x+y)*0.07+noise)&255;bitmap[i+3]=255;
  }
  const original=nativeImage.createFromBitmap(bitmap,{width,height}).toPNG();
  const source=path.join(root,'cos-original.png');
  fs.writeFileSync(source,original);
  const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  const originalDigest=digest(original),cos='https://'+COS_HOST;
  const projectPath='/projects/smoke/image/123-asset.png';
  const sign=pathname=>cos+pathname+'?q-key-time=1;9999999999&q-signature=smoke';
  const curl=session.fromPartition('cos-media-smoke',{cache:false}).fetch.bind(session.fromPartition('cos-media-smoke'));
  const stored=new Map();
  const wave=Buffer.alloc(1000,44),audioPath='/projects/smoke/audio/12-asset.wav';
  const receivedAudio=[];
  let direct=0;
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    if(req.method==='PUT') {
      const chunks=[];
      for await (const chunk of req) chunks.push(chunk);
      stored.set(url.pathname,Buffer.concat(chunks));
      res.writeHead(200).end();
    } else if(url.pathname===audioPath) {
      receivedAudio.push([req.method,req.headers.range||'']);
      const start=req.headers.range==='bytes=500-'?500:0;
      res.setHeader('Content-Type','audio/wav');
      res.setHeader('Content-Length',wave.length-start);
      if(req.headers.range) {
        res.statusCode=206;
        res.setHeader('Content-Range',`bytes ${start}-999/1000`);
      }
      res.end(req.method==='HEAD'?undefined:wave.subarray(start));
    } else if(url.pathname==='/relay') {
      const mode=url.searchParams.get('mode');
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify(mode==='relay'?{route:mode,mime:'image/png',base64:Buffer.from('relay-fixture').toString('base64')}:{route:mode}));
    } else { direct++;res.writeHead(200,{'content-type':'image/png'}).end(original); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const local=(url,options={})=>{
    const target=new URL(url);
    const headers=new Headers(options.headers);
    headers.delete('content-length');
    return curl(base+target.pathname+target.search,{...options,headers});
  };
  try {
    const cache=createCosImageCache({directory:path.join(root,'cos-cache')});
    await uploadToBucket('smoke',source,'image','fixture', (url,data)=>cache.seed(url,'smoke',data), {
      requestSignature:async()=>({url:cos+projectPath,objectKey:projectPath.slice(1),contentType:'image/png',authorization:'fixture'}),
      putObject:local,
    });
    const raw=sign(projectPath);
    const readOrigin=async url=>{
      const response=await local(url);
      return {bytes:Buffer.from(await response.arrayBuffer()),mime:response.headers.get('content-type')};
    };
    const bytes=url=>cache.read(url,'smoke',()=>readOrigin(url),{signal:new AbortController().signal});
    const preview=createAssetImagePreview({
      readAccount:()=> 'smoke',resolveImage:async payload=>{assert.equal(payload.preview,false);return {url:raw};},
      readBytes:bytes,previewCache:{get:async()=>null},peekOriginal:(url,owner)=>cache.peek(url,owner),
    });
    assert.match((await preview({imageId:'fixture'})).url,/^xzmedia:/);
    assert.match((await preview({original:true})).url,/^xzmedia:/);
    assert.equal(digest((await bytes(raw)).bytes),originalDigest);
    assert.equal(direct,0);
    const temporary='/temporary/generation/smoke/small.jpg';
    const prepare=createNineyReferenceUploader({
      getSession:()=>({token:'fixture',account:{id:'smoke'}}),readLocalOriginal:bytes,
      compress:(buffer,mime)=>compressReferenceImage(buffer,mime,{nativeImage}),
      gateway:async()=>({url:cos+temporary,downloadUrl:cos+temporary+'?signature=fixture',expiresAt:Date.now()+600000}),
      fetchFn:async(url,options)=>{
        const chunks=[];
        for await(const chunk of options.body) chunks.push(chunk);
        return local(url,{...options,body:Buffer.concat(chunks)});
      },
    });
    const result=await prepare({kind:'video',videoProtocol:'niney',references:[{id:'smoke',url:raw,kind:'image'}]});
    assert.match(result.references[0].url,/temporary\/generation/);
    const compressed=stored.get(temporary);
    assert.ok(compressed.length<original.length*0.8);
    assert.deepEqual(nativeImage.createFromBuffer(compressed).getSize(),{width,height});
    assert.equal(digest(fs.readFileSync(source)),originalDigest);
    assert.equal(digest(stored.get(projectPath)),originalDigest);
    assert.equal(direct,0);
    for(const mode of ['relay','busy','large','timeout']) {
      const read=createSmallMediaReader({getToken:()=> 'fixture',call:async()=>{
        if(mode==='timeout') {
          const response=await curl(base+'/relay?mode=timeout',{signal:AbortSignal.abort()});
          return response.json();
        }
        return (await curl(base+'/relay?mode='+mode)).json();
      }});
      const address=sign('/projects/smoke/image/relay-'+mode+'.png');
      const response=await cache.read(address,'smoke',async()=>await read(address,'smoke')||await readOrigin(address));
      assert.equal(response.bytes.length,mode==='relay'?'relay-fixture'.length:original.length);
    }
    assert.equal(direct,3);
    const play=(method,range)=>readProjectAudio(new Request('xzmedia://project-audio/smoke',{method,headers:range?{Range:range}:{}}),
      sign(audioPath),'smoke',{readScope:()=>'smoke',cache,relay:async()=>null,fetchFn:local,local:createLocalMediaHandler(()=>root)});
    assert.equal((await play('HEAD')).headers.get('content-length'),'1000');
    assert.deepEqual(Buffer.from(await (await play('GET','bytes=500-')).arrayBuffer()),wave.subarray(500));
    assert.equal(await cache.peek(sign(audioPath),'smoke'),null);
    assert.deepEqual(Buffer.from(await (await play('GET','bytes=0-')).arrayBuffer()),wave);
    assert.deepEqual(Buffer.from(await (await play('GET','bytes=500-')).arrayBuffer()),wave.subarray(500));
    assert.deepEqual(receivedAudio,[['HEAD',''],['GET','bytes=500-'],['GET','bytes=0-']]);
    return {uploadedAndRereadSameBytes:true,originalBytes:original.length,temporaryBytes:compressed.length,relayAndFallback:true,audioRangesAndCache:true,paidRequests:0};
  } finally { await new Promise(resolve=>server.close(resolve)); }
};
