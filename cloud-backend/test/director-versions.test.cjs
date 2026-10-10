const test=require('node:test'),assert=require('node:assert/strict');
const {directorVersionRepository}=require('../src/director-versions.cjs');
function fixture(){
 let row={id:'project',owner_id:'owner',owner_name:'制片',genre:'[DIRECTOR_PROJECT]',name:'项目',script:'原稿',episodes:[{id:'e',content:'原文',prompts:[]}]},seq=0;
 const versions=[],sql=[];
 const query=async(q,a=[])=>{sql.push(q);
  if(/^(BEGIN|COMMIT|ROLLBACK)$/.test(q))return{rows:[]};
  if(q.startsWith('select p.*'))return{rows:[structuredClone(row)]};
  if(q.startsWith('select 1 as ok'))return{rows:['a','b','c','d'].includes(a[1])?[{ok:1}]:[]};
  if(q.startsWith('select status,id'))return{rows:versions.filter(v=>v.author_id===a[1]&&v.submission_id===a[2])};
  if(q.startsWith('select id from'))return{rows:versions.slice(0,1)};
  if(q.startsWith('insert into director_project_versions')){const v={id:'version-'+(++seq),sequence:String(seq),project_id:a[0],author_id:a[1],author_name:a[2],submission_id:a[3],status:a[4],document:JSON.parse(a[5]),base_document:a[6]?JSON.parse(a[6]):null,source_version_id:a[7],published_document:a[8]?JSON.parse(a[8]):null};versions.push(v);return{rows:[structuredClone(v)]};}
  if(q.startsWith('update collab_projects')){row={...row,name:a[1],script:a[2],episodes:JSON.parse(a[3])};return{rows:[structuredClone(row)]};}
  if(q.startsWith('select * from director_project_versions'))return{rows:versions.filter(v=>v.id===a[1])};
  if(q.startsWith('select id,sequence'))return{rows:versions.filter(v=>BigInt(v.sequence)<BigInt(a[1])).reverse().slice(0,31)};
  throw Error('Unexpected query: '+q);
 };
 const repo=directorVersionRepository({query,connect:async()=>({query,release(){}})}),doc=()=>({name:row.name,script:row.script,episodes:structuredClone(row.episodes)});
 return{repo,versions,sql,doc,set:patch=>{row={...row,...patch};}};
}
test('five members retain personal submissions, merge independent changes, and preserve both same-place conflict versions',async()=>{
 const f=fixture(),base=f.doc();
 for(const uid of ['owner','a','b','c','d']){
  const result=await f.repo.publishDirectorVersion('project',{submissionId:'upload-'+uid,base,updates:{episodes:[{...base.episodes[0],prompts:[{id:'prompt-'+uid,text:uid+' 修改'}]}]}},uid,uid);
  assert.equal(result.episodes[0].prompts.length,['owner','a','b','c','d'].indexOf(uid)+1);
 }
 assert.equal(f.versions.filter(v=>v.status==='accepted').length,5);
 const conflictBase=f.doc();
 await f.repo.publishDirectorVersion('project',{submissionId:'same-place-a',base:conflictBase,updates:{script:'A 的版本'}},'a','A');
 const conflict=await f.repo.publishDirectorVersion('project',{submissionId:'same-place-b',base:conflictBase,updates:{script:'B 的版本'}},'b','B');
 assert.equal(conflict.versionConflict,true);assert.equal(f.doc().script,'A 的版本');assert.equal(f.versions.at(-1).document.script,'B 的版本');assert.equal(f.sql.at(-1),'COMMIT');
 const id=conflict.versionId;await f.repo.publishDirectorVersion('project',{submissionId:'independent-c',base:f.doc(),updates:{name:'C 改标题'}},'c','C');
 assert.equal(await f.repo.restoreDirectorVersion('project',{versionId:id,mode:'resolve',currentDocument:f.doc()},'b','B'),null);
 const chosen=await f.repo.restoreDirectorVersion('project',{versionId:id,mode:'resolve',currentDocument:f.doc()},'owner','制片');
 assert.equal(chosen.script,'B 的版本');assert.equal(chosen.name,'C 改标题');assert.equal(chosen.episodes[0].prompts.length,5);
 assert.ok(f.versions.some(v=>v.document.script==='A 的版本'));assert.ok(f.versions.some(v=>v.status==='restore'&&v.document.script==='B 的版本'));
});
test('upload response retries use one submission, while restore conflicts and outsiders cannot change history',async()=>{
 const f=fixture(),args={submissionId:'repeat-upload',base:f.doc(),updates:{script:'新稿'}};
 await f.repo.publishDirectorVersion('project',args,'a','A');await f.repo.publishDirectorVersion('project',args,'a','A');
 assert.equal(f.versions.filter(v=>v.submission_id===args.submissionId).length,1);
 const expected=f.doc();f.set({script:'制片确认前发生的新改动'});
 await assert.rejects(f.repo.restoreDirectorVersion('project',{versionId:f.versions[1].id,mode:'restore',currentDocument:expected},'owner','制片'),e=>e.status===409);
 assert.equal(f.doc().script,'制片确认前发生的新改动');
 assert.equal(await f.repo.listDirectorVersions('project',{},'outsider'),null);assert.equal(await f.repo.getDirectorVersion('project',f.versions[0].id,'outsider'),null);assert.equal(await f.repo.publishDirectorVersion('project',args,'outsider',''),null);
 f.set({genre:'[DIRECTOR_PROJECT]\n[PROJECT_LOCKED]'});await assert.rejects(f.repo.publishDirectorVersion('project',args,'a','A'),e=>e.status===423);
});
test('full historical restoration keeps the current shared snapshot and the original author version',async()=>{
 const f=fixture();await f.repo.publishDirectorVersion('project',{submissionId:'initial-upload',base:f.doc(),updates:{script:'第一份修改'}},'a','A');
 const target=f.versions[1];await f.repo.publishDirectorVersion('project',{submissionId:'second-upload',base:f.doc(),updates:{script:'第二份修改'}},'b','B');
 const result=await f.repo.restoreDirectorVersion('project',{versionId:target.id,mode:'restore',currentDocument:f.doc()},'owner','制片');
 assert.equal(result.script,'第一份修改');assert.ok(f.versions.some(v=>v.status==='baseline'&&v.document.script==='第二份修改'));assert.equal(target.author_id,'a');
});

test('local empty tombstone defaults do not turn a clean replaced episode into a false publication conflict',async()=>{
 const f=fixture(),base=f.doc(),local={...base,name:'我只改标题',episodes:base.episodes.map(e=>({...e,deletedPromptIds:[]}))};
 f.set({episodes:[{id:'new',content:'他人新正文',prompts:[]}]});
 const saved=await f.repo.publishDirectorVersion('project',{submissionId:'empty-defaults',base,updates:local},'a','A');
 assert.equal(saved.name,'我只改标题');assert.equal(saved.episodes[0].id,'new');assert.equal(saved.versionConflict,undefined);
});
