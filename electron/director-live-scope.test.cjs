const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../src/v06/useDirectorRealtime.js'),'utf8').replace(/\r\n/g,'\n');
const body=src.slice(src.indexOf(' const adoptRestored=async cloud=>{')+' const adoptRestored=async cloud=>{'.length,src.indexOf('\n };\n return {...notice'));
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
test('actual restore callback cannot overwrite another account, project or directory while stopping old sync',async()=>{
 for(const change of [{accountId:'b'},{projectId:'other'},{directoryEpoch:2}]){
  let release;const wait=new Promise(r=>release=r),current={current:{stop:()=>wait}},latest={current:{accountId:'a',projectId:'p',cloudProjectId:'cloud',directoryEpoch:0}},skipCache={current:null};let writes=0,epochs=0;
  const callback=new AsyncFunction('cloud','current','latest','flushEditing','setState','project','skipCache','setDirectoryEpoch','directorLiveWork',body);
  const task=callback({id:'cloud'},current,latest,()=>{},()=>writes++,{id:'p'},skipCache,()=>epochs++,()=>({}));latest.current={...latest.current,...change};release();await task;assert.equal(writes,0);assert.equal(epochs,0);assert.equal(skipCache.current,null);
 }
});
