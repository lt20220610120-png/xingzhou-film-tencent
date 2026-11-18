const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),{gunzipSync,brotliDecompressSync}=require('node:zlib');
const {createServer}=require('../src/server.cjs');
test('large project responses are compressed losslessly; summary is small and keeps access metadata',async()=>{
 const row={id:'p',owner_id:'u',name:'项目',genre:'都市',script:'测试剧本'.repeat(10000),episodes:[{id:'e',content:'剧本'}],analysis_output:'结果',analysis_progress:{1:{output:'结果'}}};
 const repo={findBySession:async()=>({id:'u',is_producer:true}),isProducer:async()=>true,listProjects:async()=>[row],findMembership:async()=>({role:'producer'})};
 const server=createServer({API_SECRET:'test',DATABASE_URL:'postgres://test'},{repository:repo,mailer:null,cosSigner:null});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const request=summary=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/api/gateway',method:'POST',headers:{'accept-encoding':'gzip','content-type':'application/json'}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({headers:res.headers,body:Buffer.concat(chunks)}));});req.on('error',reject);req.end(JSON.stringify({action:'project-list',summary}));});
 try{const full=await request(false);assert.equal(full.headers['content-encoding'],'gzip');assert.equal(JSON.parse(gunzipSync(full.body))[0].script,row.script);assert.ok(full.body.length<2000);const summary=await request(true);const item=JSON.parse(summary.headers['content-encoding']==='gzip'?gunzipSync(summary.body):summary.body)[0];assert.equal(item.id,'p');assert.equal(item.myRole,'producer');assert.equal(item.script,undefined);assert.equal(item.episodes,undefined);assert.equal(item.episodeCount,1);}
 finally{await new Promise(r=>server.close(r));}
});

test('oversized snapshots use large-window Brotli and preserve gzip fallback', async t => {
 const {randomBytes}=require('node:crypto');
 const unique=randomBytes(192*1024).toString('base64');
 const row={id:'p',owner_id:'u',name:'大项目',genre:'都市',script:unique.repeat(5),episodes:[]};
 const repo={findBySession:async()=>({id:'u'}),getProject:async()=>row};
 const server=createServer({API_SECRET:'test',DATABASE_URL:'postgres://test'},{repository:repo,mailer:null,cosSigner:null});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const request=(encoding,revision)=>new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/api/gateway',method:'POST',headers:{
   'accept-encoding':encoding,'content-type':'application/json','x-xingzhou-snapshot':'1',
   ...(revision?{'x-xingzhou-known-revision':revision}:{})
  }},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({headers:res.headers,body:Buffer.concat(chunks)}));});
  req.on('error',reject);req.end(JSON.stringify({action:'project-get',projectId:'p'}));
 });
 const br=await request('gzip, deflate, br');
 assert.equal(br.headers['content-encoding'],'br');
 const gzip=await request('gzip, br;q=0');
 assert.equal(gzip.headers['content-encoding'],'gzip');
 const decoded=JSON.parse(brotliDecompressSync(br.body));
 assert.deepEqual(decoded,JSON.parse(gunzipSync(gzip.body)));
 assert.equal(decoded._xzSnapshot.value.script,row.script);
 assert.ok(br.body.length<gzip.body.length/2);
 const unchanged=await request('br',decoded._xzSnapshot.revision);
 assert.equal(unchanged.headers['content-encoding'],undefined);
 assert.equal(JSON.parse(unchanged.body)._xzSnapshot.unchanged,true);
});
