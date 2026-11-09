const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const {writeJsonAtomic,renameWithRetry}=require('./atomic-json.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-save-'));t.after(()=>{assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'xingzhou-save-'));fs.rmSync(root,{recursive:true,force:true});});return root;}
const exited=child=>new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code));});
test('streamed JSON matches native JSON, concurrent writers use separate temporary files and failures keep the original',async t=>{
 const root=fixture(t),file=path.join(root,'state.json'),data={unicode:'中\n"\\😀',rows:[null,undefined,NaN,{a:undefined,b:true}],a:{x:1},b:{x:1},date:new Date('2026-11-09')};
 await writeJsonAtomic(file,data);assert.equal(fs.readFileSync(file,'utf8'),JSON.stringify(data));
 await Promise.all(Array.from({length:12},(_,id)=>writeJsonAtomic(file,{id,payload:'保存'.repeat(100)})));assert(Number.isInteger(JSON.parse(fs.readFileSync(file)).id));assert.deepEqual(fs.readdirSync(root),['state.json']);
 const before=fs.readFileSync(file),cycle={};cycle.self=cycle;await assert.rejects(writeJsonAtomic(file,cycle),/circular/);assert.deepEqual(fs.readFileSync(file),before);assert.deepEqual(fs.readdirSync(root),['state.json']);
 let tries=0;await assert.rejects(renameWithRetry('a','b',{rename:async()=>{tries++;throw Object.assign(Error('disk full'),{code:'ENOSPC'})},sleep:async()=>{throw Error('should not retry')}}),/disk full/);assert.equal(tries,1);
});
test('Windows real deny-delete handle is retried; a permanent lock never truncates the old document',{skip:process.platform!=='win32',timeout:15000},async t=>{
 const root=fixture(t),file=path.join(root,'state.json');fs.writeFileSync(file,'{"old":true}');
 const script=`import ctypes,sys,time\nk=ctypes.WinDLL('kernel32',use_last_error=True)\nk.CreateFileW.restype=ctypes.c_void_p\nk.CreateFileW.argtypes=[ctypes.c_wchar_p,ctypes.c_uint,ctypes.c_uint,ctypes.c_void_p,ctypes.c_uint,ctypes.c_uint,ctypes.c_void_p]\nh=k.CreateFileW(sys.argv[1],0x80000000,3,None,3,0x80,None)\nassert h!=ctypes.c_void_p(-1).value\nprint('locked',flush=True)\nif sys.argv[2]=='short':time.sleep(.3)\nelse:sys.stdin.readline()\nk.CloseHandle.argtypes=[ctypes.c_void_p]\nk.CloseHandle(h)\n`;
 for(const mode of ['short','held']){
  const child=spawn('python',['-c',script,file,mode],{windowsHide:true,stdio:['pipe','pipe','pipe']}),done=exited(child);await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>{if(code)reject(Error('lock helper failed'))});});
  try{if(mode==='short'){const start=Date.now();await writeJsonAtomic(file,{saved:true});assert(Date.now()-start>=100);assert.deepEqual(JSON.parse(fs.readFileSync(file)),{saved:true});}
   else{await assert.rejects(writeJsonAtomic(file,{wrong:true}),e=>['EPERM','EBUSY','EACCES'].includes(e.code));assert.deepEqual(JSON.parse(fs.readFileSync(file)),{saved:true});assert.deepEqual(fs.readdirSync(root),['state.json']);}}
  finally{child.stdin.end('\n');await done;}
 }
});
test('a JSON library over 120 MB saves in a child with a 64 MB V8 heap',{timeout:30000},async t=>{
 const root=fixture(t),file=path.join(root,'large.json'),module=path.join(__dirname,'atomic-json.cjs');
 const code=`const {writeJsonAtomic}=require(process.argv[1]);const text='中'.repeat(500);const data={rows:Array.from({length:90000},(_,i)=>({i,text}))};writeJsonAtomic(process.argv[2],data).then(()=>console.log(JSON.stringify({heap:process.memoryUsage().heapUsed}))).catch(e=>{console.error(e);process.exitCode=1});`;
 const child=spawn(process.execPath,['--max-old-space-size=64','-e',code,module,file],{windowsHide:true,stdio:['ignore','pipe','pipe']}),done=exited(child);let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);assert.equal(await done,0,errors);assert(fs.statSync(file).size>120*1024*1024);assert(JSON.parse(output).heap<64*1024*1024);
});
test('state worker preserves shrink backups and recovers after a message-clone failure',async t=>{
 const root=fixture(t),file=path.join(root,'projects.json'),writer=require('./state-writer.cjs');
 await writer.writeStateAsync(file,[{id:1},{id:2}],{backup:true});await writer.writeStateAsync(file,[{id:1}],{backup:true});assert.equal(JSON.parse(fs.readFileSync(path.join(root,'projects.backup.json'))).length,2);
 await assert.rejects(writer.writeStateAsync(file,{bad(){}}));await writer.writeStateAsync(file,[{id:3}],{backup:true});await writer.flushStateWrites();assert.equal(writer.hasPendingStateWrites(),false);assert.deepEqual(JSON.parse(fs.readFileSync(file)),[{id:3}]);
});
