const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {writeStateAsync}=require('./state-writer.cjs');

test('director deltas preserve both local snapshots and untouched projects across partial and full saves',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xz-state-delta-'));
 t.after(async()=>{for(const name of await fs.readdir(root))await fs.unlink(path.join(root,name));await fs.rmdir(root);});
 const file=path.join(root,'xingzhou-data.json'),directorFile=path.join(root,'director-projects.json');
 const first={id:'a',episodes:[{id:'e',prompts:[{content:'已有提示词'}]}]},second={id:'b',name:'未编辑'},newer={...second,name:'较新副本',updatedAt:'2026-11-22'};
 const read=async path=>JSON.parse(await fs.readFile(path,'utf8'));
 await writeStateAsync(file,{active:'old',unrelated:{content:'剧本'},directorProjects:[first,second]});
 await writeStateAsync(directorFile,[first,newer]);
 const edited={...first,updatedAt:'2026-11-22',notes:'场景完成'};
 await writeStateAsync(file,{directors:{order:['a','b'],changed:[edited]}},{directorFile});
 assert.deepEqual((await read(file)).directorProjects,[edited,newer]);
 assert.deepEqual(await read(directorFile),[edited,newer]);
 await writeStateAsync(file,{workspace:{set:{active:'new'},remove:[]}}, {directorFile});
 assert.deepEqual(await read(file),{active:'new',unrelated:{content:'剧本'},directorProjects:[edited,newer]});
 await writeStateAsync(file,{directors:{order:['b'],changed:[]}},{directorFile});
 assert.deepEqual(await read(directorFile),[newer]);
 assert.deepEqual(await read(directorFile.replace('.json','.backup.json')),[edited,newer]);
});
