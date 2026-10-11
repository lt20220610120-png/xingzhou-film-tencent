const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const {pruneUpdateCache}=require('./update-cache.cjs');
test('installer cache keeps latest two and protected active install, removes old owned fragments only',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'xz-updates-'));try{const now=Date.now(),names=[];
 for(let i=1;i<=4;i++){const name=`Xingzhou-Film-Setup-2.8.${i}.exe`;names.push(name);await fs.writeFile(path.join(dir,name),'MZ');await fs.utimes(path.join(dir,name),(now+i*1000)/1000,(now+i*1000)/1000);}
 const partial=`Xingzhou-Film-Setup-2.8.0.exe.${'a'.repeat(64)}.part`;await fs.writeFile(path.join(dir,partial),'x');await fs.utimes(path.join(dir,partial),(now-8*86400000)/1000,(now-8*86400000)/1000);await fs.writeFile(path.join(dir,'user-project.json'),'important');await fs.mkdir(path.join(dir,'Local Storage.bak'));
 await pruneUpdateCache(dir,{now,protectedFiles:[path.join(dir,names[0])]});const remaining=await fs.readdir(dir);assert.ok(remaining.includes(names[0]));assert.ok(!remaining.includes(names[1]));assert.ok(remaining.includes(names[2])&&remaining.includes(names[3]));assert.ok(!remaining.includes(partial));assert.ok(remaining.includes('user-project.json')&&remaining.includes('Local Storage.bak'));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
