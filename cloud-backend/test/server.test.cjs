const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require(process.env.XINGZHOU_TEST_SERVER_MODULE || '../src/server.cjs');

test('云端健康检查只返回公开状态，不返回密钥或数据库地址', async () => {
  const server = createServer({ API_SECRET: 'test-secret', DATABASE_URL: 'postgres://test', PORT: '0' }, {repository:{},mailer:null,cosSigner:null});
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'xingzhou-cloud-backend' });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

const http=require('node:http');
const {validateReview,signature,sourceScenes}=require('../src/art-review-repository.cjs');
test('split UTF-8 request chunks preserve Chinese review text and approval signatures',async()=>{
 const episode={episodeNumber:1,content:'1-1 家 日 内\n人物：甲。'};
 const data={schema:1,episodeNumber:1,sourceContent:episode.content,scenes:sourceScenes(episode.content,1).map(s=>({...s,items:[{id:'a',category:'character',name:'【甲】',description:'蓝色长衫与黑鞋',ready:true}]})),unassigned:[],published:{},history:[]};
 data.scenes[0].approval={signature:signature(data.scenes[0])};let received;
 const repo={findBySession:async()=>({id:'u'}),getProject:async()=>({id:'p',owner_id:'u'}),isProjectLocked:async()=>false,saveArtReview:async(pid,p)=>{received=p.data;return validateReview(p.data,episode,1);}};
 const server=createServer({API_SECRET:'test',DATABASE_URL:'postgres://test'},{repository:repo,mailer:null,cosSigner:null});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const body=Buffer.from(JSON.stringify({action:'art-review-save',projectId:'p',episodeNumber:1,data}));const cut=body.indexOf(Buffer.from('蓝色长衫'))+1;
 try{
  const result=await new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/api/gateway',method:'POST',headers:{'content-type':'application/json','content-length':body.length}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(Buffer.concat(chunks))}));});req.on('error',reject);req.setNoDelay(true);req.write(body.subarray(0,cut));setTimeout(()=>req.end(body.subarray(cut)),40);});
  assert.equal(result.status,200,JSON.stringify(result.data));assert.deepEqual(received,data);
 }finally{await new Promise(r=>server.close(r));}
});
