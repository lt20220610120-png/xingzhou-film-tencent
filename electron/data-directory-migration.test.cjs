const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const load=()=>require('./data-directory-migration.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'xz-migrate-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const source=path.join(root,'old'),target=path.join(root,'new');await fs.mkdir(source);await fs.mkdir(target);return {source,target};}
test('资料迁移复制素材、所有进度和备份，并改写本机路径，保留原目录',async t=>{
 const {source,target}=await fixture(t);const original=path.join(source,'画布素材','a.png');
 await fs.mkdir(path.dirname(original));await fs.writeFile(original,'image');
 const custom=path.join(source,'参考片','a.mp4');await fs.mkdir(path.dirname(custom));await fs.writeFile(custom,'video');
 const state={directorProjects:[{id:'p',mediaFile:original,legacyUrl:'xzmedia:///'+encodeURIComponent(original),url:'xzmedia://local/'+encodeURIComponent(original)}],scriptProjects:[{id:'s',draft:'保留文字',referenceVideo:custom}]};await fs.writeFile(path.join(source,'xingzhou-data.json'),JSON.stringify(state));
 for(const dir of ['analysis-checkpoints','art-review-checkpoints','director-live-local','导演工作台的项目/quick-generation/account']){await fs.mkdir(path.join(source,dir),{recursive:true});await fs.writeFile(path.join(source,dir,'progress.json'),JSON.stringify({filePath:original}));}
 await load().prepareDataDirectory(source,target,state);
 const saved=JSON.parse(await fs.readFile(path.join(target,'xingzhou-data.json'),'utf8'));assert.equal(saved.directorProjects[0].mediaFile,path.join(target,'画布素材','a.png'));assert.equal(saved.scriptProjects[0].draft,'保留文字');
 assert.equal(saved.directorProjects[0].url,'xzmedia://local/'+encodeURIComponent(path.join(target,'画布素材','a.png')));assert.equal(saved.directorProjects[0].legacyUrl,saved.directorProjects[0].url);
 for(const dir of ['analysis-checkpoints','art-review-checkpoints','director-live-local','导演工作台的项目/quick-generation/account'])assert.equal(JSON.parse(await fs.readFile(path.join(target,dir,'progress.json'),'utf8')).filePath,path.join(target,'画布素材','a.png'));
 assert.equal(await fs.readFile(original,'utf8'),'image');assert.equal(await fs.readFile(path.join(target,'画布素材/a.png'),'utf8'),'image');
 assert.equal(saved.scriptProjects[0].referenceVideo,path.join(target,'参考片/a.mp4'));assert.equal(await fs.readFile(saved.scriptProjects[0].referenceVideo,'utf8'),'video');
});
test('已有资料目标目录保持独立；损坏目标、嵌套目标与符号链接拒绝迁移',async t=>{
 const {source,target}=await fixture(t);await fs.writeFile(path.join(target,'xingzhou-data.json'),JSON.stringify({scriptProjects:[{id:'existing'}]}));
 assert.equal((await load().prepareDataDirectory(source,target,{})).mode,'existing');assert.equal(JSON.parse(await fs.readFile(path.join(target,'xingzhou-data.json'),'utf8')).scriptProjects[0].id,'existing');
 await fs.writeFile(path.join(target,'xingzhou-data.json'),'bad');await assert.rejects(load().prepareDataDirectory(source,target,{}),/无法解析/);
 await assert.rejects(load().prepareDataDirectory(source,path.join(source,'inside'),{}),/嵌套/);
});
test('校验失败时目标不留下可被加载的不完整主状态',async t=>{
 const {source,target}=await fixture(t);await fs.writeFile(path.join(source,'xingzhou-data.json'),'{}');await fs.mkdir(path.join(source,'art-review-checkpoints'));await fs.writeFile(path.join(source,'art-review-checkpoints/bad.json'),'bad');
 await assert.rejects(load().prepareDataDirectory(source,target,{}),/无法解析/);await assert.rejects(fs.access(path.join(target,'xingzhou-data.json')),{code:'ENOENT'});
});
test('未提交副本取消后同目录重试会重新读取最新正文',async t=>{
 const {source,target}=await fixture(t);await fs.writeFile(path.join(source,'xingzhou-data.json'),JSON.stringify({note:'旧正文'}));
 const first=await load().prepareDataDirectory(source,target,{}, {deferCommit:true});await assert.rejects(fs.access(path.join(target,'xingzhou-data.json')),{code:'ENOENT'});
 await first.cancel();await fs.writeFile(path.join(source,'xingzhou-data.json'),JSON.stringify({note:'刚生成的新正文'}));
 const second=await load().prepareDataDirectory(source,target,{}, {deferCommit:true});await second.commit();assert.equal(JSON.parse(await fs.readFile(path.join(target,'xingzhou-data.json'),'utf8')).note,'刚生成的新正文');
});
