const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const {lookup} = require('node:dns/promises');

const networkError = code => Object.assign(Error('LibTV proxy transport'),{code});

function untilAbort(work,signal) {
 if(!signal)return Promise.resolve(work);
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(signal.reason);
  if(signal.aborted)abort();
  else signal.addEventListener('abort',abort,{once:true});
  Promise.resolve(work).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}

function waitSocket(socket,event,signal) {
 return new Promise((resolve,reject)=>{
  const close=()=>finish(networkError('ECONNRESET')),abort=()=>finish(signal.reason);
  const ready=()=>finish();
  function finish(error) {
   signal.removeEventListener('abort',abort);
   socket.off(event,ready);socket.off('error',finish);socket.off('close',close);
   if(error)reject(error);else resolve(socket);
  }
  socket.once(event,ready);socket.once('error',finish);socket.once('close',close);
  if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
 });
}

function readBytes(socket,length,signal) {
 return new Promise((resolve,reject)=>{
  const closed=()=>fail(networkError('ECONNRESET')),abort=()=>fail(signal.reason);
  function cleanup(){
   socket.off('readable',read);socket.off('end',closed);socket.off('close',closed);socket.off('error',fail);
   signal.removeEventListener('abort',abort);
  }
  function fail(error){cleanup();reject(error);}
  function read(){
   const bytes=socket.read(length);
   if(bytes){
    if(bytes.length===length){cleanup();resolve(bytes);}
    else closed();
   }
  }
  socket.on('readable',read);socket.once('end',closed);socket.once('close',closed);socket.once('error',fail);
  if(signal.aborted)abort();
  else if(socket.destroyed||socket.readableEnded)closed();
  else{signal.addEventListener('abort',abort,{once:true});read();}
 });
}

async function negotiateSocks5(socket,host,signal) {
 socket.write(Buffer.from([5,1,0]));
 const method=await readBytes(socket,2,signal);
 if(method[0]!==5)throw networkError('SOCKS_PROTOCOL');
 if(method[1]!==0)throw networkError('SOCKS_AUTH_REQUIRED');
 const domain=Buffer.from(host,'ascii');
 if(domain.length>253)throw networkError('SOCKS_PROTOCOL');
 socket.write(Buffer.concat([Buffer.from([5,1,0,3,domain.length]),domain,Buffer.from([1,187])]));
 const reply=await readBytes(socket,4,signal);
 if(reply[0]!==5||reply[2]!==0)throw networkError('SOCKS_PROTOCOL');
 if(reply[1]!==0)throw networkError('SOCKS_REPLY_'+reply[1]);
 const length=reply[3]===1?4:reply[3]===4?16:reply[3]===3?(await readBytes(socket,1,signal))[0]:0;
 if(!length)throw networkError('SOCKS_PROTOCOL');
 await readBytes(socket,length+2,signal);
}

async function negotiateSocks4(socket,host,signal) {
 // PAC's SOCKS and SOCKS4 identifiers specify local DNS and IPv4.
 const {address}=await untilAbort(lookup(host,{family:4}),signal);
 signal.throwIfAborted();
 socket.write(Buffer.from([4,1,1,187,...address.split('.').map(Number),0]));
 const reply=await readBytes(socket,8,signal);
 if(reply[0]!==0)throw networkError('SOCKS_PROTOCOL');
 if(reply[1]!==90)throw networkError('SOCKS4_REPLY_'+reply[1]);
}

function httpTunnel(proxy,hostname,host,signal) {
 return new Promise((resolve,reject)=>{
  const authority=host+':443';
  const request=(proxy.protocol==='https:'?https:http).request({
   hostname,port:proxy.port||(proxy.protocol==='https:'?443:80),
   ...(proxy.protocol==='https:'&&!net.isIP(proxy.hostname.replace(/^\[|\]$/g,''))?{servername:proxy.hostname}:{}),
   method:'CONNECT',path:authority,headers:{Host:authority},agent:false,
  });
  const abort=()=>request.destroy(signal.reason);
  const cleanup=()=>signal.removeEventListener('abort',abort);
  request.once('error',error=>{cleanup();reject(error);});
  request.once('connect',(response,socket,head)=>{
   cleanup();
   if(response.statusCode!==200){
    socket.destroy();
    reject(networkError('PROXY_HTTP_'+response.statusCode));
    return;
   }
   socket.pause();
   if(head.length)socket.unshift(head);
   resolve(socket);
  });
  if(signal.aborted)abort();
  else{signal.addEventListener('abort',abort,{once:true});request.end();}
 });
}

async function connectLibTVRoute(row,signal,connect) {
 signal.throwIfAborted();
 const fixtureSocket=connect?.(row);
 if(fixtureSocket||row.protocol==='direct') {
  const socket=fixtureSocket||net.connect({host:row.host,port:443});
  try{return await waitSocket(socket,'connect',signal);}catch(error){socket.destroy();throw error;}
 }
 const proxy=new URL(row.proxy);
 // Windows commonly resolves "localhost" to IPv6 before the IPv4-only Clash listener.
 const host=proxy.hostname.replace(/^\[|\]$/g,'');
 const proxyHost=host.toLowerCase()==='localhost'?'127.0.0.1':host;
 if(row.protocol==='http'||row.protocol==='https'){
  return httpTunnel(proxy,proxyHost,row.host,signal);
 }
 const socket=net.connect({host:proxyHost,port:Number(proxy.port||1080)});
 try{
  await waitSocket(socket,'connect',signal);
  if(row.protocol==='socks5')await negotiateSocks5(socket,row.host,signal);
  else await negotiateSocks4(socket,row.host,signal);
  return socket;
 }catch(error){socket.destroy();throw error;}
}

module.exports={connectLibTVRoute,networkError,untilAbort};
