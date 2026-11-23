const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const {once} = require('node:events');
const {createLibTVNetwork,normalizeLibTVNetworkOptions} = require('./libtv-network.cjs');
const {connectLibTVRoute} = require('./libtv-proxy-transport.cjs');

const target = 'api.liblib.tv';
const generic = {code:'LIBTV_NETWORK',networkCode:'FETCH_FAILED',retryable:true};
async function listen(server,t) {
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>server.close());
  return server.address().port;
}
function openTunnel(command) {
  const proxy = new URL(command.env.HTTPS_PROXY);
  return new Promise((resolve,reject)=>{
    const req=http.request({host:proxy.hostname,port:proxy.port,path:target+':443',method:'CONNECT',headers:{
      'Proxy-Authorization':'Basic '+Buffer.from(proxy.username+':'+proxy.password).toString('base64'),
    }});
    req.once('connect',(response,socket)=>resolve({status:response.statusCode,socket}));
    req.once('error',reject);
    req.end();
  });
}
async function roundTrip(command,value='fixture payload') {
  const {status,socket} = await openTunnel(command);
  try {
    assert.equal(status,200);
    const received = once(socket,'data');
    socket.write(value);
    assert.equal(String((await received)[0]),value);
  } finally { socket.destroy(); }
}

test('custom URLs normalize SOCKS aliases and reject secrets, opaque extras and malformed ports',()=>{
  assert.deepEqual(normalizeLibTVNetworkOptions({mode:'custom',proxyUrl:' socks://localhost:7897 '}),{mode:'custom',proxyUrl:'socks5://localhost:7897'});
  assert.deepEqual(normalizeLibTVNetworkOptions({mode:'direct',proxyUrl:'garbage'}),{mode:'direct',proxyUrl:''});
  for(const proxyUrl of ['https://alice:fixture-secret@localhost:7897','socks5://localhost:7897/path','http://localhost:7897?key=fixture-secret','http://localhost:7897#diagnostics','http://localhost:65536','ftp://localhost:7897']){
    assert.throws(()=>normalizeLibTVNetworkOptions({mode:'custom',proxyUrl}),error=>!error.message.includes('fixture-secret'));
  }
});

test('system HTTP loopback sends only one real CONNECT per command and recovers fresh commands after proxy resets',async t=>{
  let connections=0;
  const proxy=http.createServer();
  proxy.on('connect',(req,socket)=>{
    connections++;
    assert.equal(req.url,target+':443');
    assert.equal(req.headers['proxy-authorization'],undefined);
    if(connections===1){socket.destroy();return;}
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    socket.pipe(socket);
  });
  const port=await listen(proxy,t);
  const n=createLibTVNetwork({resolveProxy:()=>`PROXY localhost:${port}`});
  t.after(()=>n.close());
  const failed=await n.environment({allowFallback:false});
  const first=await openTunnel(failed);
  first.socket.destroy();
  assert.equal(first.status,502);
  assert.equal(failed.diagnose(generic).networkCode,'ECONNRESET');
  failed.dispose();
  const second=await n.environment();
  await roundTrip(second);
  assert.deepEqual(second.routeReport(),{route:'http',source:'system-proxy'});
  assert.equal(connections,2);
  second.dispose();
});

test('SOCKS5 system and custom modes negotiate a remote hostname with fragmented replies',async t=>{
  const attempts=[];
  const socks=net.createServer(socket=>{
    let buffer=Buffer.alloc(0),stage=0;
    const receive=chunk=>{
      buffer=Buffer.concat([buffer,chunk]);
      if(stage===0&&buffer.length>=3){
        assert.deepEqual([...buffer.subarray(0,3)],[5,1,0]);
        buffer=buffer.subarray(3);stage++;
        socket.write(Buffer.from([5]));
        setImmediate(()=>socket.write(Buffer.from([0])));
      }
      if(stage===1&&buffer.length>=5&&buffer.length>=7+buffer[4]){
        assert.deepEqual([...buffer.subarray(0,4)],[5,1,0,3]);
        const length=buffer[4];
        attempts.push([buffer.subarray(5,5+length).toString(),buffer.readUInt16BE(5+length)]);
        socket.removeListener('data',receive);
        socket.write(Buffer.from([5,0,0,1]));
        setImmediate(()=>socket.write(Buffer.alloc(6)));
        socket.pipe(socket);
      }
    };
    socket.on('data',receive);
  });
  const port=await listen(socks,t);
  let settings={mode:'system',proxyUrl:''},lookups=0;
  const n=createLibTVNetwork({getSettings:()=>settings,resolveProxy:()=>{lookups++;return `SOCKS5 localhost:${port}`;}});
  t.after(()=>n.close());
  for(const source of ['system-proxy','custom-proxy']){
    const command=await n.environment();
    await roundTrip(command);
    assert.deepEqual(command.routeReport(),{route:'socks5',source});
    command.dispose();
    settings={mode:'custom',proxyUrl:`socks5://127.0.0.1:${port}`};
  }
  assert.deepEqual(attempts,[[target,443],[target,443]]);
  assert.equal(lookups,1);
});

test('legacy PAC SOCKS uses SOCKS4 and IPv4 resolution',async t=>{
  const attempts=[];
  const proxy=net.createServer(socket=>{
    socket.once('data',bytes=>{
      attempts.push([...bytes]);
      socket.write(Buffer.from([0,90,0,0,0,0,0,0]));
      socket.pipe(socket);
    });
  });
  const port=await listen(proxy,t);
  const socket=await connectLibTVRoute({protocol:'socks4',proxy:`socks4://localhost:${port}`,host:'localhost'},AbortSignal.timeout(1000));
  try{
    const next=once(socket,'data');
    socket.resume();
    socket.write('fixture');
    assert.equal(String((await next)[0]),'fixture');
    assert.deepEqual(attempts,[[4,1,1,187,127,0,0,1,0]]);
  }finally{socket.destroy();}
});

test('a real HTTP proxy timeout can fall back before bytes, with no probes or concurrent proxy churn',async t=>{
  const echo=net.createServer(socket=>socket.pipe(socket)),directPort=await listen(echo,t);
  let active=0,peak=0,requests=0;
  const proxy=http.createServer();
  proxy.on('connect',(_request,socket)=>{
    requests++;active++;peak=Math.max(peak,active);
    socket.once('close',()=>active--);
    // A saturated proxy leaves the first CONNECT pending.
    socket.resume();
  });
  const proxyPort=await listen(proxy,t);
  const n=createLibTVNetwork({
    resolveProxy:()=>`PROXY localhost:${proxyPort}; DIRECT`,connectTimeout:50,
    connect:row=>row.mode==='direct'?net.connect(directPort,'127.0.0.1'):undefined,
  });
  t.after(()=>n.close());
  for(let index=0;index<3;index++){
    const command=await n.environment();
    await roundTrip(command);
    assert.deepEqual(command.routeReport(),{route:'direct',source:'direct'});
    command.dispose();
  }
  assert.deepEqual({peak,requests},{peak:1,requests:1});
});

test('explicit direct mode never looks up or connects to the failing system proxy',async t=>{
  const echo=net.createServer(socket=>socket.pipe(socket)),port=await listen(echo,t);
  let resolverCalls=0;
  const n=createLibTVNetwork({
    getSettings:()=>({mode:'direct'}),
    resolveProxy:()=>{resolverCalls++;throw Error('fixture failed proxy');},
    connect:row=>{assert.equal(row.mode,'direct');return net.connect(port,'127.0.0.1');},
  });
  t.after(()=>n.close());
  const command=await n.environment();
  await roundTrip(command);
  assert.equal(resolverCalls,0);
  assert.deepEqual(command.routeReport(),{route:'direct',source:'direct'});
  command.dispose();
});

test('non-replayable commands never use another route after first CONNECT failure',async t=>{
  const modes=[];
  const n=createLibTVNetwork({
    resolveProxy:()=> 'PROXY localhost:7897; DIRECT',
    connect:row=>{
      modes.push(row.mode);
      const socket=new (require('node:stream').PassThrough)();
      queueMicrotask(()=>socket.destroy(Object.assign(Error('fixture reset'),{code:'ECONNRESET'})));
      return socket;
    },
  });
  t.after(()=>n.close());
  const command=await n.environment({allowFallback:false});
  const result=await openTunnel(command);
  result.socket.destroy();
  assert.equal(result.status,502);
  assert.deepEqual(modes,['system-proxy']);
  command.dispose();
});
