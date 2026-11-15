// Run with Electron: verifies actual Chromium request framing, not a fetch mock.
const {app,net}=require('electron'),http=require('node:http'),assert=require('node:assert/strict'),fs=require('node:fs');
app.whenReady().then(async()=>{let server;try{
 const bytes=Buffer.from('desktop-upload-fixture'),received=[];
 server=http.createServer((request,response)=>{const chunks=[];request.on('data',c=>chunks.push(c));request.on('end',()=>{received.push({body:Buffer.concat(chunks),headers:request.headers});response.end('ok');});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
 await assert.rejects(net.fetch(url,{method:'PUT',headers:{'Content-Length':String(bytes.length)},body:bytes}),/ERR_INVALID_ARGUMENT/);
 const fetch=require('../electron/desktop-api-transport.cjs').createDesktopAPIFetch(net);
 for(const headers of [{'Content-Length':String(bytes.length)},{'content-length':String(bytes.length)}]){
 const result=await fetch(url,{method:'PUT',headers:{...headers,Authorization:'fixture','Content-Type':'image/png'},body:bytes});assert.equal(await result.text(),'ok');}
 assert.equal(received.length,2);for(const item of received){assert.deepEqual(item.body,bytes);assert.equal(item.headers.authorization,'fixture');assert.equal(Number(item.headers['content-length']),bytes.length);}
 const report={baselineError:'ERR_INVALID_ARGUMENT',fixedUploads:received.length,bytesIdentical:true};
 if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report));console.log(JSON.stringify(report));
 }catch(e){console.error(e);process.exitCode=1;}finally{server?.close();app.exit(process.exitCode||0);}});
