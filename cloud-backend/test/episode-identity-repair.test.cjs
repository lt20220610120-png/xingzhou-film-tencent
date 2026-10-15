const test=require('node:test');
const assert=require('node:assert/strict');
const {handleAction}=require('../src/collab.cjs');
const {extendRepository}=require('../src/repository-extras.cjs');
const helper=()=>require('../src/episode-identity-repair.cjs').applyEpisodeIdentityChange;
const episode=(id,number=24,extra={})=>({id,title:`第${number}集`,content:`${number}-1 原稿 ${id}`,prompts:[],...extra});

test('ten manuscript edits grow history linearly and retain every previous draft without nested history',()=>{
 const content=version=>`24-1 稿件版本${version}\n`+'文'.repeat(10000);
 let rows=[episode('draft',24,{content:content(0)})];
 for(let version=1;version<=10;version++)rows=helper()(rows,{operation:'edit',index:0,content:content(version)});
 const history=rows[0].episodeIdentityHistory;
 assert.equal(history.length,10);
 assert.deepEqual(history.map(h=>h.episode.content),Array.from({length:10},(_,version)=>content(version)));
 assert.ok(history.every(h=>!Object.hasOwn(h.episode,'episodeIdentityHistory')));
 assert.ok(JSON.stringify(rows).length<12*(10000+1000),'history stores one snapshot per edit');
});
test('existing nested history is flattened and deduplicated through edit, primary selection and removal',()=>{
 const oldest={at:'old',reason:'edit',episode:episode('old')};
 const previous={at:'previous',reason:'edit',episode:episode('previous',24,{episodeIdentityHistory:[oldest]})};
 const nested=episode('nested',24,{episodeIdentityHistory:[oldest,previous,{...previous,episode:{...previous.episode,episodeIdentityHistory:[oldest,oldest]}}]});
 for(const operation of ['edit','select-primary','remove']){
  const rows=[nested,episode('carrier')],next=helper()(rows,{operation,index:0,...(operation==='edit'?{content:'24-1 新修订'}:{})});
  const history=next.flatMap(ep=>ep.episodeIdentityHistory||[]);
  for(const id of ['old','previous',operation==='select-primary'?'carrier':'nested'])assert.equal(history.filter(h=>h.episode?.id===id).length,1,`${operation}: ${id} retained once`);
  assert.ok(history.every(h=>!h.episode||!Object.hasOwn(h.episode,'episodeIdentityHistory')));
 }
});
test('primary selection never revives deleted shot IDs or deleted source labels from either draft',()=>{
 const rows=[episode('primary',24,{prompts:[{id:'kept',label:'24-1-1'},{id:'removed-elsewhere',label:'24-1-2'}],deletedPromptIds:['removed-here','source-label:24-1-3']}),episode('other',24,{prompts:[{id:'removed-here',label:'24-1-4',image:'archived.png'},{id:'other-id',label:'24-1-3'},{id:'good',label:'24-1-5'}],deletedPromptIds:['removed-elsewhere']})];
 const [next]=helper()(rows,{operation:'select-primary',index:0});
 assert.deepEqual(next.prompts.map(p=>p.id),['kept','good']);
 assert.deepEqual(new Set(next.deletedPromptIds),new Set(['removed-here','removed-elsewhere','source-label:24-1-3']));
 assert.equal(next.episodeIdentityHistory.find(h=>h.episode?.id==='other').episode.prompts[0].image,'archived.png');
});
test('primary selection archives the chosen shot image before a merged tombstone removes it from live work',()=>{
 const {filterRemovedDirectorEpisodes}=require('../src/episode-identity-repair.cjs');
 const chosen=episode('chosen',24,{prompts:[{id:'chosen-only',label:'24-1-1',image:'unique-chosen.png',generationConfig:{video:'unique.mp4'}}]});
 const other=episode('other',24,{deletedPromptIds:['chosen-only']});
 const [next]=helper()([chosen,other],{operation:'select-primary',index:0});
 assert.deepEqual(next.prompts,[]);
 const original=next.episodeIdentityHistory.find(h=>h.reason==='primary-before-merge'&&h.episode?.id==='chosen');
 assert.ok(original,'chosen business snapshot is retained before tombstones are merged');
 assert.deepEqual(original.episode,chosen);
 assert.deepEqual(filterRemovedDirectorEpisodes([next],[chosen,other]),[chosen]);
});
test('renumbered manuscripts suppress their former source identity with or without a stable source ID',()=>{
 const {filterRemovedDirectorEpisodes}=require('../src/episode-identity-repair.cjs');
 const {mergeDirectorEpisodes}=require('../src/storyboard-merge.cjs');
 for(const original of [episode('source'),{title:'第24集',content:'24-1 旧源'}]){
  const next=helper()([original],{operation:'edit',index:0,episodeNumber:25,title:'第25集',content:'25-1 修正'});
  const merged=mergeDirectorEpisodes(next,filterRemovedDirectorEpisodes(next,[original]));
  assert.equal(merged.length,1);assert.equal(merged[0].title,'第25集');assert.equal(merged[0].content,'25-1 修正');
 }
});
test('primary selection suppresses archived source identities without suppressing the chosen source',()=>{
 const {filterRemovedDirectorEpisodes}=require('../src/episode-identity-repair.cjs');
 const first=episode('first'),selected=episode('bilingual'),third={title:'第24集',content:'24-1 第三份无ID原稿'};
 const next=helper()([first,selected,third],{operation:'select-primary',index:1});
 assert.deepEqual(filterRemovedDirectorEpisodes(next,[first,selected,third]),[selected]);
});

test('select-primary preserves the chosen bilingual manuscript and all removed rows, shots and counters',()=>{
 const rows=[episode('original',24,{prompts:[{id:'a',image:'a.png'}],shotCounters:{'24-1':5},deletedPromptIds:['gone'],episodeIdentityHistory:[{at:'past',reason:'past',episode:{id:'older'}}]}),episode('bilingual',24,{content:'24-1 原文\nEnglish translation',prompts:[{id:'b',image:'b.png'}],shotCounters:{'24-1':2}}),episode('duplicate'),episode('later',25)];
 const before=structuredClone(rows),next=helper()(rows,{operation:'select-primary',index:1});
 assert.deepEqual(rows,before);assert.equal(next.length,2);assert.equal(next[0].id,'bilingual');assert.equal(next[0].content,rows[1].content);
 assert.deepEqual(next[0].prompts.map(p=>p.id),['b','a']);assert.equal(next[0].shotCounters['24-1'],5);assert.deepEqual(next[0].deletedPromptIds,['gone']);
 assert.ok(next[0].episodeIdentityHistory.some(h=>h.episode?.id==='original'&&h.episode.prompts[0].image==='a.png'));
 assert.ok(next[0].episodeIdentityHistory.some(h=>h.episode?.id==='duplicate'));assert.ok(next[0].episodeIdentityHistory.some(h=>h.reason==='past'));
 assert.equal(next[0].collabOnly,true);
});
test('edit retains exact previous manuscript and rejects contradictory or newly colliding numbers',()=>{
 const rows=[episode('a'),episode('b'),episode('c',25)];
 const next=helper()(rows,{operation:'edit',index:1,episodeNumber:26,title:'第26集',content:'26-1 校正'});
 assert.equal(next[1].id,'b');assert.equal(next[1].episodeNumber,26);assert.deepEqual(next[1].episodeIdentityHistory.at(-1).episode,rows[1]);
 for(const change of [{episodeNumber:25,title:'第25集',content:'25-1 撞号'},{episodeNumber:26,title:'第24集',content:'26-1 矛盾'}])assert.throws(()=>helper()(rows,{operation:'edit',index:1,...change}),e=>e.status===400||e.status===409);
});
test('remove archives only the selected record and refuses the final history carrier',()=>{
 const rows=[episode('a'),episode('b')],next=helper()(rows,{operation:'remove',index:1});
 assert.equal(next.length,1);assert.deepEqual(next[0].episodeIdentityHistory.at(-1).episode,rows[1]);
 assert.throws(()=>helper()([episode('a')],{operation:'remove',index:0}),e=>e.status===409);
 for(const index of [-1,0.5,99])assert.throws(()=>helper()(rows,{operation:'remove',index}),e=>e.status===400);
});
function poolFor(row,{role='producer',source,error}={}){
 const queries=[];let current=structuredClone(row);
 return {queries,saved:()=>current,connect:async()=>({release(){},async query(sql,values){
  queries.push({sql,values});
  if(sql.includes('and p.genre like')){if(error)throw error;return {rows:source?[source]:[]};}
  if(/^select p\.\*/.test(sql))return {rows:[structuredClone(current)]};
  if(sql.includes('from collab_members'))return {rows:role?[{ok:1}]:[]};
  if(/^update collab_projects set episodes=/.test(sql)){current={...current,episodes:JSON.parse(values[1]),script:values[2]};return {rows:[structuredClone(current)]};}
  return {rows:[]};
 }})};
}
const project=()=>({id:'project',owner_id:'owner',genre:'[COLLAB_PROJECT]',script:'完整旧总稿',episodes:[episode('a'),episode('b')],analysis_progress:{keep:true}});
test('repair repository locks, checks full baseline, preserves script history and updates only target script/episodes',async()=>{
 const row=project(),pool=poolFor(row),repo=extendRepository(pool);
 const next=await repo.resolveEpisodeIdentity('project',{baseEpisodes:row.episodes,operation:'select-primary',index:1},'owner');
 assert.equal(next.episodes.length,1);assert.match(next.script,/原稿 b/);assert.deepEqual(next.analysis_progress,row.analysis_progress);
 assert.ok(next.episodes[0].episodeIdentityHistory.some(h=>h.previousProjectScript===row.script));
 const writes=pool.queries.filter(q=>/^update /.test(q.sql));assert.equal(writes.length,1);assert.deepEqual(writes[0].values[0],'project');assert.doesNotMatch(writes[0].sql,/analysis|genre/);
 assert.match(pool.queries[1].sql,/for update/);assert.equal(pool.queries.at(-1).sql,'COMMIT');
 const stale=poolFor(row);await assert.rejects(extendRepository(stale).resolveEpisodeIdentity('project',{baseEpisodes:[row.episodes[0]],operation:'remove',index:0},'owner'),e=>e.status===409);assert.equal(stale.queries.filter(q=>/^update /.test(q.sql)).length,0);
});
test('repair repository rechecks actual producer membership, lock, recycle and director domain under row lock',async()=>{
 for(const [row,role,uid,status] of [[project(),null,'outsider',null],[{...project(),genre:'[DIRECTOR_PROJECT]'},'producer','owner',null],[{...project(),genre:'[COLLAB_PROJECT][PROJECT_LOCKED]'},'producer','owner',423],[{...project(),deleted_at:'now'},'producer','owner',410]]){
  const pool=poolFor(row,{role}),work=extendRepository(pool).resolveEpisodeIdentity('project',{baseEpisodes:row.episodes,operation:'remove',index:1},uid);
  if(status)await assert.rejects(work,e=>e.status===status);else assert.equal(await work,null);
  assert.equal(pool.queries.filter(q=>/^update /.test(q.sql)).length,0);
 }
});
test('identity action authorizes project role rather than global producer and returns conflict without overwrite',async()=>{
 for(const role of ['producer','collaborator','artist']){
  let called=0;const row=project(),repo={getProject:async()=>row,findMembership:async()=>({role}),listMembers:async()=>[{user_id:'member',role}],isProjectLocked:async()=>false,resolveEpisodeIdentity:async(_id,p,uid)=>{called++;assert.equal(uid,'member');throw Object.assign(new Error('stale'),{status:409,code:'EPISODE_IDENTITY_STALE'});}};
  const result=await handleAction('episode-identity-resolve',{projectId:'project',baseEpisodes:row.episodes,operation:'remove',index:1},{id:'member',is_producer:true},repo);
  assert.equal(result.status,role==='producer'?409:403);assert.equal(called,role==='producer'?1:0);
 }
});
test('automatic refresh returns unchanged readable project and transient warning for numbered conflicts',async()=>{
 const row={...project(),genre:'[COLLAB_PROJECT][COLLAB_SOURCE:source]'},source={id:'source',genre:'[DIRECTOR_PROJECT]',episodes:[episode('s'),episode('t')],script:'重复源'};
 const pool=poolFor(row,{source}),next=await extendRepository(pool).refreshDirectorPrompts('project','owner');
 assert.deepEqual(next.episodes,row.episodes);assert.ok(next.director_sync_warning);assert.equal(pool.queries.filter(q=>/^update /.test(q.sql)).length,0);assert.equal(pool.queries.at(-1).sql,'COMMIT');
 const broken=poolFor(row,{error:Object.assign(new Error('network'),{code:'ECONNRESET'})});await assert.rejects(extendRepository(broken).refreshDirectorPrompts('project','owner'),/network/);
});
test('explicit director sync rejects invalid incoming and colliding merge before any update',async()=>{
 for(const row of [{...project(),episodes:[episode('old',23)]},{...project(),episodes:[episode('old')]}]){
  const pool=poolFor(row);const incoming=row.episodes[0].title==='第23集'?[episode('x'),episode('y')]:[episode('different',24,{title:'第二十四集 新版',content:'另一份正文'})];
  await assert.rejects(extendRepository(pool).syncDirectorSnapshot('project',{episodes:incoming,script:'源稿'},'owner'),e=>e.code==='EPISODE_IDENTITY_CONFLICT');
  assert.equal(pool.queries.filter(q=>/^update /.test(q.sql)).length,0);
 }
});
test('director refresh keeps explicit removal absent from both live episodes and recomposed script',async()=>{
 const row={...project(),genre:'[COLLAB_PROJECT][COLLAB_SOURCE:source]',episodes:[episode('keep',25,{episodeIdentityHistory:[{at:'past',reason:'remove',episode:episode('removed')}],collabOnly:true})]};
 const source={id:'source',genre:'[DIRECTOR_PROJECT]',episodes:[episode('removed'),episode('keep',25)],script:'第24集\n24-1 被移除的旧原稿\n\n第25集\n25-1 原稿 keep'};
 const pool=poolFor(row,{source}),next=await extendRepository(pool).refreshDirectorPrompts('project','owner');
 assert.equal(next.episodes.length,1);assert.equal(next.episodes[0].id,'keep');assert.doesNotMatch(next.script,/24|被移除/);
});
test('automatic refresh treats source script segmentation conflicts as transient identity warnings',async()=>{
 const row={...project(),genre:'[COLLAB_PROJECT][COLLAB_SOURCE:source]',episodes:[episode('keep',24,{collabOnly:true})]};
 const source={id:'source',genre:'[DIRECTOR_PROJECT]',episodes:[episode('source')],script:'第24集\n24-1 第一段\n第24集\n24-2 第二段'};
 const pool=poolFor(row,{source}),next=await extendRepository(pool).refreshDirectorPrompts('project','owner');
 assert.ok(next.director_sync_warning);assert.deepEqual(next.episodes,row.episodes);assert.equal(pool.queries.at(-1).sql,'COMMIT');
});
test('explicit sync refuses malformed snapshots before source promotion or project writes',async()=>{
 for(const fields of [{episodes:[null]},{episodes:'invalid'},{episodes:[episode('a')],script:{bad:true}}]){
  const pool=poolFor({...project(),episodes:[episode('a',23)]});
  await assert.rejects(extendRepository(pool).syncDirectorSnapshot('project',fields,'owner'),e=>e.status===400);
  assert.equal(pool.queries.filter(q=>/^update /.test(q.sql)).length,0);
 }
});
test('explicit remove prevents an ID-less legacy source manuscript from resurrecting',()=>{
 const {filterRemovedDirectorEpisodes}=require('../src/episode-identity-repair.cjs');
 const removed={title:'第24集',content:'24-1 原稿'},keep=episode('keep',25,{episodeIdentityHistory:[{reason:'remove',episode:removed}]});
 assert.deepEqual(filterRemovedDirectorEpisodes([keep],[removed,episode('keep',25)]),[episode('keep',25)]);
});
