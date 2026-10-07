import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFrameworkProject,frameworkState,frameworkEvents,frameworkEventCode,frameworkLinks,applyFrameworkCommand as cmd} from './frameworkWorkflow.js';

const fresh=()=>normalizeFrameworkProject({id:'p',mode:'framework',episodes:[],creator:{mode:'framework'}});
const setup=()=>{
 let p=fresh();
 p=cmd(p,{type:'settings.propose',items:[{id:'rule',text:'世界规则'}]});
 p=cmd(p,{type:'settings.resolve',id:'rule',choice:'replace'});
 p=cmd(p,{type:'settings.confirm'});
 p=cmd(p,{type:'group.add',group:{id:'g',title:'阶段'}});
 for(const id of ['a','b'])p=cmd(p,{type:'event.add',groupId:'g',event:{id,title:id,summary:'行动'}});
 for(const id of ['a','b'])p=cmd(p,{type:'node.confirm',id,confirmed:true});
 p=cmd(p,{type:'node.confirm',id:'g',confirmed:true});
 p=cmd(p,{type:'mainline.link',link:{id:'l',fromId:'a',toId:'b',notes:'因果'}});
 return cmd(p,{type:'mainline.review',id:'l'});
};
test('migration preserves all legacy content and is idempotent without inventing events',()=>{
 const old={id:'old',mode:'framework',episodes:[{id:'e',title:'第1集',content:'细纲',result:'正文',custom:{x:1}}],creator:{mode:'framework',sections:{events:{input:'原始事件',output:'非结构化事件'},settings:{output:'旧规则'}},story:{events:[]},legacy:{original:'原文'}},finalScript:'全集',custom:true};
 const p=normalizeFrameworkProject(old);
 assert.deepEqual(normalizeFrameworkProject(p),p);
 assert.equal(p.creator.framework.version,2);
 assert.equal(p.creator.framework.groups.length,0);
 assert.deepEqual(p.creator.framework.legacy.sections,old.creator.sections);
 assert.deepEqual(p.episodes,old.episodes);
 assert.deepEqual(old.creator.sections.events,{input:'原始事件',output:'非结构化事件'});
 const free={mode:'free',episodes:[]};assert.equal(normalizeFrameworkProject(free),free);
});
test('settings changes require explicit conflict choice and prevent formal adoption',()=>{
 let p=setup();p=cmd(p,{type:'settings.propose',items:[{id:'new',text:'另一规则',conflictsWith:['rule']}]});
 assert.throws(()=>cmd(p,{type:'settings.confirm'}),{code:'FRAMEWORK_SETTINGS_PENDING'});
 assert.throws(()=>cmd(p,{type:'event.update',id:'a',patch:{story:'完整事件故事'}}),{code:'FRAMEWORK_SETTINGS_PENDING'});
 p=cmd(p,{type:'settings.resolve',id:'new',choice:'merge',text:'人工合并规则'});
 assert.equal(frameworkState(p).settings.items.length,1);
 assert.equal(frameworkState(p).settings.items[0].text,'人工合并规则');
 p=cmd(p,{type:'settings.confirm'});assert.equal(frameworkState(p).settings.confirmed,true);
});
test('locked nodes and parent locks reject edit delete move and collateral reordering',()=>{
 let p=setup();p=cmd(p,{type:'node.lock',id:'a',locked:true});
 for(const c of [{type:'event.update',id:'a',patch:{summary:'改'}},{type:'event.remove',id:'a'},{type:'event.move',id:'a',index:1,groupId:'g'},{type:'event.move',id:'b',index:0,groupId:'g'}])assert.throws(()=>cmd(p,c),{code:'FRAMEWORK_LOCKED'});
 p=cmd(p,{type:'node.lock',id:'g',locked:true});
 assert.throws(()=>cmd(p,{type:'event.add',groupId:'g',event:{title:'新'}}),{code:'FRAMEWORK_LOCKED'});
 assert.throws(()=>cmd(p,{type:'node.lock',id:'a',locked:false}),{code:'FRAMEWORK_LOCKED'});
});
test('event hierarchy supports loose events, middle groups, stable IDs and regenerated display numbers',()=>{
 let p=setup();p=cmd(p,{type:'group.add',group:{id:'h',title:'后段'}});
 p=cmd(p,{type:'middle.add',groupId:'h',middle:{id:'m',title:'中事件'}});
 p=cmd(p,{type:'event.add',event:{id:'loose',title:'独立'}});
 assert.equal(frameworkEvents(p).find(x=>x.event.id==='loose').group,null);
 p=cmd(p,{type:'event.move',id:'a',groupId:'h',middleId:'m',index:0});
 assert.equal(frameworkEventCode(p,'a'),'B1');
 p=cmd(p,{type:'group.move',id:'h',index:0});
 assert.equal(frameworkEventCode(p,'a'),'A1');
 assert.equal(frameworkEvents(p).find(x=>x.event.id==='a').middle.id,'m');
});
test('links require review and become stale after endpoint or order changes',()=>{
 let p=setup();p=cmd(p,{type:'mainline.link',link:{id:'l',fromId:'a',toId:'b',notes:'因果'}});
 assert.throws(()=>cmd(p,{type:'mainline.confirm'}),{code:'FRAMEWORK_UNCONFIRMED'});
 p=cmd(p,{type:'mainline.review',id:'l'});p=cmd(p,{type:'mainline.confirm'});
 p=cmd(p,{type:'event.update',id:'a',patch:{summary:'新的行动'}});
 assert.equal(frameworkLinks(p)[0].stale,true);
 assert.equal(frameworkState(p).mainline.confirmed,false);
});
test('complete event story precedes independent episode plans and body switching restores each version',()=>{
 let p=setup();p=cmd(p,{type:'event.update',id:'a',patch:{story:'从头到尾的完整事件故事'}});
 assert.equal(frameworkState(p).plans.length,0);
 p=cmd(p,{type:'mainline.review',id:'l'});
 p=cmd(p,{type:'mainline.confirm'});
 p=cmd(p,{type:'plan.add',plan:{id:'p1',name:'紧凑版',episodes:[{id:'e1',content:'a',eventIds:['a','b']}]}});
 p=cmd(p,{type:'plan.activate',id:'p1'});
 p=cmd(p,{type:'episode.update',planId:'p1',episodeId:'e1',patch:{result:'版本一正文',finalConfirmed:true}});
 p=cmd(p,{type:'plan.add',plan:{id:'p2',name:'展开版',episodes:[{id:'e2',eventIds:['a']},{id:'e3',eventIds:['a','b']}]}});
 p=cmd(p,{type:'plan.activate',id:'p2'});assert.equal(p.episodes[0].result,'');
 p=cmd(p,{type:'episode.update',planId:'p2',episodeId:'e2',patch:{result:'版本二正文'}});
 p=cmd(p,{type:'plan.activate',id:'p1'});assert.equal(p.episodes[0].result,'版本一正文');
 p=cmd(p,{type:'plan.delete',id:'p1'});assert.equal(frameworkState(p).activePlanId,null);
 p=cmd(p,{type:'plan.restore',id:'p1'});p=cmd(p,{type:'plan.activate',id:'p1'});
 assert.equal(p.episodes[0].result,'版本一正文');assert.equal(p.episodes[0].finalConfirmed,true);
});
test('simulation adoption enforces runtime input and locks and leaves original project untouched',()=>{
 let p=setup();p=cmd(p,{type:'node.lock',id:'a',locked:true});
 p=cmd(p,{type:'simulation.add',simulation:{id:'s',inputFingerprint:'f',groups:[{id:'g',title:'阶段',events:[{id:'a',title:'篡改'},{id:'b',title:'b'}]}]}});
 assert.throws(()=>cmd(p,{type:'simulation.adopt',id:'s',inputFingerprint:'f'}),{code:'FRAMEWORK_LOCKED'});
 const before=JSON.stringify(p);p=cmd(p,{type:'event.update',id:'b',patch:{summary:'changed'}});
 assert.throws(()=>cmd(p,{type:'simulation.adopt',id:'s',inputFingerprint:'f'}),{code:'FRAMEWORK_STALE'});
 assert.notEqual(JSON.stringify(p),before);
});
test('source removal is recoverable and component insertion retains provenance without adopting source rules',()=>{
 let p=setup();p=cmd(p,{type:'source.add',source:{id:'src',content:'原著正文',name:'原著'}});
 p=cmd(p,{type:'component.add',component:{id:'c',sourceId:'src',sourceEventId:'orig',rawText:'原著事件',title:'参考事件',summary:'参考'}});
 assert.throws(()=>cmd(p,{type:'component.insert',id:'c',groupId:'g'}),{code:'FRAMEWORK_UNCONFIRMED'});
 p=cmd(p,{type:'component.confirm',id:'c'});p=cmd(p,{type:'component.insert',id:'c',groupId:'g',event:{id:'adapted',title:'本剧事件',summary:'适配'}});
 assert.equal(frameworkEvents(p).find(x=>x.event.id==='adapted').event.source.sourceId,'src');
 assert.equal(frameworkState(p).settings.items[0].text,'世界规则');
 p=cmd(p,{type:'source.remove',id:'src'});assert.equal(frameworkState(p).archives.find(x=>x.kind==='source').snapshot.content,'原著正文');
});

test('manual outline edits retain bodies but revoke confirmation and stale later episode continuity',()=>{
 let p=cmd(setup(),{type:'mainline.confirm'});
 p=cmd(p,{type:'plan.add',plan:{id:'v',episodes:[{id:'e1',content:'旧纲',eventIds:['a']},{id:'e2',eventIds:['b']}]}});
 p=cmd(p,{type:'plan.activate',id:'v'});
 for(const id of ['e1','e2'])p=cmd(p,{type:'episode.update',planId:'v',episodeId:id,patch:{result:`${id}正文`,finalConfirmed:true}});
 p=cmd(p,{type:'plan.update',id:'v',patch:{episodes:[{id:'e1',content:'新纲'},{id:'e2',content:'后续纲'}]}});
 assert.equal(p.episodes[0].result,'e1正文');assert.equal(p.episodes[0].stale,true);assert.equal(p.episodes[0].finalConfirmed,false);
 assert.equal(p.episodes[1].stale,true);assert.equal(p.episodes[1].finalConfirmed,false);
});
test('human plan review rebinds changed event snapshot before continued script writing',()=>{
 let p=cmd(setup(),{type:'mainline.confirm'});
 p=cmd(p,{type:'plan.add',plan:{id:'v',episodes:[{id:'e',eventIds:['a']}]}});
 p=cmd(p,{type:'event.update',id:'a',patch:{summary:'新的行动'}});
 assert.throws(()=>cmd(p,{type:'episode.update',planId:'v',episodeId:'e',patch:{result:'新正文'}}),{code:'FRAMEWORK_STALE'});
 assert.throws(()=>cmd(p,{type:'plan.update',id:'v',patch:{stale:false}}),{code:'FRAMEWORK_UNCONFIRMED'});
 p=cmd(p,{type:'mainline.review',id:'l'});p=cmd(p,{type:'mainline.confirm'});p=cmd(p,{type:'plan.update',id:'v',patch:{stale:false}});
 assert.equal(frameworkState(p).plans[0].eventSnapshot[0].events[0].summary,'新的行动');
 p=cmd(p,{type:'episode.update',planId:'v',episodeId:'e',patch:{result:'复核后的正文'}});
 assert.equal(frameworkState(p).plans[0].episodes[0].result,'复核后的正文');
});
test('locking confirmed events does not invalidate reviewed mainline or existing plans',()=>{
 let p=cmd(setup(),{type:'mainline.confirm'});p=cmd(p,{type:'plan.add',plan:{id:'v',episodes:[{id:'e'}]}});
 p=cmd(p,{type:'node.lock',id:'a',locked:true});
 assert.equal(frameworkState(p).mainline.confirmed,true);assert.equal(frameworkState(p).plans[0].stale,false);
});
test('legacy structured groups migrate reliably and unstructured v1 data remains recoverable',()=>{
 const old={id:'p',mode:'framework',creator:{mode:'framework',framework:{version:1,ideaSummary:{raw:'unknown'},custom:'keep'},sections:{skeleton:{output:JSON.stringify({groups:[{id:'g',title:'旧阶段',events:[{id:'old',title:'旧事',summary:'行动',source:'原文'}]}]})}},story:{events:[{id:'story',content:'另一份资料'}]}}};
 const p=normalizeFrameworkProject(old);assert.equal(frameworkEventCode(p,'old'),'A1');
 assert.deepEqual(frameworkState(p).legacy.framework,old.creator.framework);
 assert.deepEqual(frameworkState(p).legacy.story,old.creator.story);
 assert.deepEqual(normalizeFrameworkProject(p),p);
});
test('invalid cross-type commands and unknown allocated event IDs are atomic',()=>{
 let p=setup();const original=JSON.stringify(p);
 assert.throws(()=>cmd(p,{type:'group.update',id:'a',patch:{title:'wrong'}}),{code:'FRAMEWORK_INVALID'});
 assert.equal(JSON.stringify(p),original);
 p=cmd(p,{type:'mainline.confirm'});p=cmd(p,{type:'plan.add',plan:{id:'v',episodes:[{id:'e',eventIds:['a']}]}});
 assert.throws(()=>cmd(p,{type:'plan.update',id:'v',patch:{episodes:[{id:'e',eventIds:['missing']}]}}),{code:'FRAMEWORK_INVALID'});
});
test('mainline structure changes flag existing allocations for review',()=>{
 let p=cmd(setup(),{type:'mainline.confirm'});p=cmd(p,{type:'plan.add',plan:{id:'v',episodes:[{id:'e'}]}});
 p=cmd(p,{type:'mainline.link',link:{id:'l',fromId:'a',toId:'b',notes:'补全动机'}});
 assert.equal(frameworkState(p).plans[0].stale,true);
});

test('existing framework recovery data never changes a free project or its episodes',()=>{
 const free={id:'free',creator:{mode:'free',framework:{version:1}},episodes:[{id:'e',result:'原正文'}]};
 assert.equal(normalizeFrameworkProject(free),free);
});
test('simulation candidate can be adopted explicitly without erasing unchanged loose events',()=>{
 let p=setup();p=cmd(p,{type:'event.add',event:{id:'loose',title:'待归组事件'}});
 const groups=structuredClone(frameworkState(p).groups);groups[0].events[1].summary='推演的新行动';
 p=cmd(p,{type:'simulation.add',simulation:{id:'s',groups,inputFingerprint:'original-task'}});
 assert.equal(frameworkState(p).groups[0].events[1].summary,'行动');
 p=cmd(p,{type:'simulation.adopt',id:'s',inputFingerprint:'original-task'});
 assert.equal(frameworkState(p).groups[0].events[1].summary,'推演的新行动');
 assert.equal(frameworkState(p).looseEvents[0].id,'loose');
});
test('project snapshots restore event and plan bodies with recovery of the state replaced',()=>{
 let p=cmd(setup(),{type:'mainline.confirm'});p=cmd(p,{type:'plan.add',plan:{id:'v',episodes:[{id:'e'}]}});p=cmd(p,{type:'plan.activate',id:'v'});
 p=cmd(p,{type:'episode.update',planId:'v',episodeId:'e',patch:{result:'旧正文'}});
 p=cmd(p,{type:'version.snapshot',name:'定稿前'});const id=frameworkState(p).archives.find(a=>a.kind==='version').id;
 p=cmd(p,{type:'episode.update',planId:'v',episodeId:'e',patch:{result:'新正文'}});
 p=cmd(p,{type:'version.restore',id});assert.equal(p.episodes[0].result,'旧正文');
 assert.equal(frameworkState(p).archives.filter(a=>a.kind==='version').length,2);
 assert.equal(frameworkState(p).archives.at(-1).snapshot.plans[0].episodes[0].result,'新正文');
});
test('middle grouping can move and delete while locked descendants survive failed operations',()=>{
 let p=setup();p=cmd(p,{type:'group.add',group:{id:'h',title:'另一阶段'}});p=cmd(p,{type:'middle.add',groupId:'g',middle:{id:'m',title:'可选层'}});
 p=cmd(p,{type:'event.move',id:'b',groupId:'g',middleId:'m'});p=cmd(p,{type:'middle.move',id:'m',groupId:'h'});
 assert.equal(frameworkEvents(p).find(r=>r.event.id==='b').group.id,'h');
 p=cmd(p,{type:'node.lock',id:'b',locked:true});assert.throws(()=>cmd(p,{type:'middle.remove',id:'m'}),{code:'FRAMEWORK_LOCKED'});
 p=cmd(p,{type:'node.lock',id:'b',locked:false});p=cmd(p,{type:'middle.remove',id:'m'});
 assert.equal(frameworkEvents(p).some(r=>r.event.id==='b'),false);
 assert.equal(frameworkState(p).archives.find(a=>a.kind==='middle').snapshot.events[0].id,'b');
});
test('source restoration and creator configuration retain original data across normalization',()=>{
 let p=setup();p=cmd(p,{type:'source.add',source:{id:'src',content:'完整原文',unknown:{page:2}}});
 p=cmd(p,{type:'source.update',id:'src',patch:{name:'新来源名'}});p=cmd(p,{type:'source.remove',id:'src'});p=cmd(p,{type:'source.restore',id:'src'});
 p=cmd(p,{type:'creator.config',patch:{runConfig:{scope:'whole',skill:'故事'},records:[{id:'r',status:'pending',output:'候选'}]}});
 p=cmd(p,{type:'record.update',id:'r',patch:{status:'rejected'}});
 const n=normalizeFrameworkProject(p);assert.equal(n.creator.records[0].status,'rejected');assert.deepEqual(n.creator.framework.sources[0].unknown,{page:2});assert.equal(n.creator.runConfig.scope,'whole');
});
test('editing allocations cannot smuggle replacement bodies or confirmations through plan updates',()=>{
 let p=cmd(setup(),{type:'mainline.confirm'});p=cmd(p,{type:'plan.add',plan:{id:'v',episodes:[{id:'e',content:'集纲',eventIds:['a']}]}});
 p=cmd(p,{type:'settings.propose',items:[{id:'pending',text:'待决规则'}]});
 p=cmd(p,{type:'plan.update',id:'v',patch:{episodes:[{id:'e',result:'未经确认正文',finalConfirmed:true},{id:'new',content:'新集纲',result:'绕过审核正文',finalConfirmed:true}]}});
 const episodes=frameworkState(p).plans[0].episodes;
 assert.equal(episodes[0].result,'');assert.equal(episodes[0].finalConfirmed,false);
 assert.equal(episodes[1].result,'');assert.equal(episodes[1].finalConfirmed,false);
});
test('legacy collection identifiers are assigned once and remain usable for normal commands',()=>{
 const p=normalizeFrameworkProject({id:'old',creator:{mode:'framework',framework:{version:1,characters:[{name:'人物'}],sources:[{content:'原文'}],components:[{title:'组件'}]}}});
 const f=frameworkState(p);assert.ok(f.characters[0].id);assert.ok(f.sources[0].id);assert.ok(f.components[0].id);
 assert.deepEqual(normalizeFrameworkProject(p),p);
 assert.doesNotThrow(()=>cmd(p,{type:'character.update',id:f.characters[0].id,patch:{description:'背景'}}));
});
test('unadopted loose ideas do not block or stale the confirmed grouped mainline and plans',()=>{
 let p=setup();p=cmd(p,{type:'event.add',event:{id:'loose',title:'未采用想法',confirmed:false}});
 p=cmd(p,{type:'mainline.confirm'});p=cmd(p,{type:'plan.add',plan:{id:'v',episodes:[{id:'e',eventIds:['a','b']}]}});
 p=cmd(p,{type:'event.update',id:'loose',patch:{summary:'修改候选'}});
 assert.equal(frameworkState(p).mainline.confirmed,true);assert.equal(frameworkState(p).plans[0].stale,false);
 assert.throws(()=>cmd(p,{type:'mainline.link',link:{fromId:'a',toId:'loose'}}),{code:'FRAMEWORK_NOT_FOUND'});
 assert.throws(()=>cmd(p,{type:'plan.add',plan:{episodes:[{eventIds:['loose']}]}}),{code:'FRAMEWORK_INVALID'});
});

test('missing adjacent connections prevent confirming a multi-event mainline',()=>{
 let p=setup();p=cmd(p,{type:'mainline.unlink',id:'l'});
 assert.throws(()=>cmd(p,{type:'mainline.confirm'}),{code:'FRAMEWORK_UNCONFIRMED'});
});
test('episode reference changes reject loose or deleted nodes and invalidate this and following bodies',()=>{
 let p=cmd(setup(),{type:'mainline.confirm'});
 p=cmd(p,{type:'plan.add',plan:{id:'v',episodes:[{id:'e1',content:'旧纲',eventIds:['a']},{id:'e2',content:'后纲',eventIds:['b']}]}});
 for(const id of ['e1','e2'])p=cmd(p,{type:'episode.update',planId:'v',episodeId:id,patch:{result:'已写正文',finalConfirmed:true}});
 p=cmd(p,{type:'event.add',event:{id:'loose',title:'未归组'}});
 for(const id of ['loose','missing'])assert.throws(()=>cmd(p,{type:'episode.update',planId:'v',episodeId:'e1',patch:{eventIds:[id]}}),{code:'FRAMEWORK_INVALID'});
 p=cmd(p,{type:'episode.update',planId:'v',episodeId:'e1',patch:{eventIds:['a','b']}});
 assert.equal(frameworkState(p).plans[0].episodes[0].stale,true);
 assert.equal(frameworkState(p).plans[0].episodes[0].finalConfirmed,false);
 assert.equal(frameworkState(p).plans[0].episodes[1].stale,true);
 assert.equal(frameworkState(p).plans[0].episodes[1].finalConfirmed,false);
});

test('adapted reference major components insert their full child sequence with provenance and human review',()=>{
 let p=setup();p=cmd(p,{type:'source.add',source:{id:'s',content:'原作'}});
 p=cmd(p,{type:'component.add',component:{id:'c',sourceId:'s',sourceEventId:'original-major',rawText:'原作',title:'参考阶段',confirmed:true}});
 const adapted={title:'本剧新阶段',events:[{title:'行动一',summary:'新的因果',source:{sourceEventId:'original-1'}},{title:'行动二',summary:'新的结果',source:{sourceEventId:'original-2'}}]};
 p=cmd(p,{type:'component.insertGroup',id:'c',group:adapted});
 const group=frameworkState(p).groups.at(-1);
 assert.equal(group.events.length,2);assert.equal(group.confirmed,false);
 assert.equal(group.events[0].source.componentId,'c');assert.equal(group.events[0].source.sourceEventId,'original-1');
 assert.equal(group.events[0].confirmed,false);assert.equal(group.events[1].source.sourceId,'s');
 assert.equal(frameworkState(p).mainline.confirmed,false);
 assert.equal(frameworkState(p).components[0].rawText,'原作');
});


test('one story review confirms populated cards and creates adjacency without form filling',()=>{
 let p=setup();p=cmd(p,{type:'event.update',id:'a',patch:{summary:'完整行动',confirmed:false}});
 p=cmd(p,{type:'mainline.unlink',id:'l'});p=cmd(p,{type:'mainline.confirmAll'});
 const f=frameworkState(p);assert.equal(f.mainline.confirmed,true);assert.equal(f.mainline.links.length,1);
 assert.deepEqual(f.mainline.links.map(l=>[l.fromId,l.toId,l.confirmed,l.stale]),[['a','b',true,false]]);
 assert.ok(frameworkEvents(p).every(r=>r.event.confirmed));
 assert.doesNotThrow(()=>cmd(p,{type:'plan.add',plan:{episodes:[{eventIds:['a','b']}]}}));
});
test('whole-story review cannot approve missing content, unresolved rules, or locked drafts',()=>{
 let p=setup();p=cmd(p,{type:'event.update',id:'a',patch:{summary:'',story:'',confirmed:false}});
 assert.throws(()=>cmd(p,{type:'mainline.confirmAll'}),/小事件内容/);
 p=cmd(p,{type:'event.update',id:'a',patch:{summary:'行动'}});p=cmd(p,{type:'node.lock',id:'a',locked:true});
 const before=JSON.stringify(p);assert.throws(()=>cmd(p,{type:'mainline.confirmAll'}),{code:'FRAMEWORK_LOCKED'});assert.equal(JSON.stringify(p),before);
 p=cmd(setup(),{type:'settings.propose',items:[{text:'待处理新规则'}]});assert.throws(()=>cmd(p,{type:'mainline.confirmAll'}),{code:'FRAMEWORK_SETTINGS_PENDING'});
});
test('manual versions can start with one empty episode while formal workflow stays gated',()=>{
 let p=fresh();assert.throws(()=>cmd(p,{type:'plan.add',plan:{episodes:[{}]}}));
 p=cmd(p,{type:'plan.add',draft:true,plan:{id:'draft1',name:'手动版',episodes:[{id:'ep-a'}]}});
 p=cmd(p,{type:'plan.activate',id:'draft1'});p=cmd(p,{type:'episode.update',planId:'draft1',episodeId:'ep-a',draft:true,patch:{result:'我的第一集'}});
 assert.equal(frameworkState(p).plans[0].stale,true);
 assert.throws(()=>cmd(p,{type:'episode.update',planId:'draft1',episodeId:'ep-a',draft:true,patch:{finalConfirmed:true}}));
 p=cmd(p,{type:'plan.add',draft:true,plan:{id:'draft2',episodes:[{id:'ep-b'},{id:'ep-c'}]}});p=cmd(p,{type:'plan.activate',id:'draft2'});
 p=cmd(p,{type:'plan.update',id:'draft2',patch:{episodes:[...frameworkState(p).plans[1].episodes,{id:'ep-d'}]}});
 assert.equal(p.episodes.length,3);assert.equal(frameworkState(p).plans[0].episodes[0].result,'我的第一集');
 p=cmd(p,{type:'plan.activate',id:'draft1'});assert.equal(p.episodes[0].result,'我的第一集');assert.equal(p.episodes.length,1);
});
test('unsubmitted inspiration is persisted independently from collected originals',()=>{
 let p=cmd(fresh(),{type:'idea.draft',text:'未提交的灵感'});p=normalizeFrameworkProject(JSON.parse(JSON.stringify(p)));
 assert.equal(frameworkState(p).ideaDraft,'未提交的灵感');assert.equal(frameworkState(p).ideas.length,0);
});

test('English setting aliases migrate without duplicate empty categories and deletion preserves history',()=>{
 const raw=fresh();raw.creator.framework.settings={items:[{id:'b',category:'background',text:'现代都市'},{id:'a',category:'ability',text:'系统奖励'}],pending:[],history:[],revision:2,confirmed:true};
 const p=normalizeFrameworkProject(raw);assert.deepEqual(p.creator.framework.settings.items.map(i=>i.category),['时代与背景','个人金手指']);
 const removed=cmd(p,{type:'settings.remove',id:'b'});
 assert.equal(removed.creator.framework.settings.confirmed,false);assert.equal(removed.creator.framework.settings.revision,3);
 assert.equal(removed.creator.framework.settings.history[0].removed.text,'现代都市');assert.equal(p.creator.framework.settings.items.length,2);
 const pending=cmd(p,{type:'settings.propose',items:[{id:'candidate',category:'premise',text:'新背景',conflictsWith:['b']}]});
 assert.equal(pending.creator.framework.settings.pending[0].category,'核心脑洞');
 assert.throws(()=>cmd(pending,{type:'settings.remove',id:'b'}),{code:'FRAMEWORK_SETTINGS_PENDING'});
});

test('batch reference selection is atomic, preserves provenance and gives imported children fresh IDs',()=>{
 let p=fresh();for(const id of ['c1','c2'])p=cmd(p,{type:'component.add',component:{id,title:id,summary:'完整大事件',groups:[{id:'source-group',events:[{id:'child',title:'小事件',summary:'行动和结果'}],middles:[{id:'middle',title:'中事件',events:[{id:'nested',title:'层内事件',summary:'层内结果'}]}]}]}});
 assert.throws(()=>cmd(p,{type:'components.insertGroups',ids:['c1','missing']}),{code:'FRAMEWORK_NOT_FOUND'});
 assert.equal(p.creator.framework.groups.length,0);assert.equal(p.creator.framework.components[0].confirmed,false);
 const simple=cmd(p,{type:'components.insertGroups',ids:['c1','c2']});assert.equal(simple.creator.framework.groups.length,2);
 assert.deepEqual(simple.creator.framework.groups.map(g=>g.source.componentId),['c1','c2']);
 assert.throws(()=>cmd(p,{type:'components.insertGroups',ids:['c1'],withChildren:true}),{code:'FRAMEWORK_UNCONFIRMED'});
 p=cmd(p,{type:'settings.confirm'});const children=cmd(p,{type:'components.insertGroups',ids:['c1','c2'],withChildren:true});
 const ids=frameworkEvents(children).map(r=>r.event.id);assert.equal(ids.length,4);assert.equal(new Set(ids).size,4);assert.ok(!ids.includes('child'));
 assert.equal(children.creator.framework.groups[0].middles[0].events[0].source.sourceEventId,'nested');
});

test('scratch drafts survive project reload without invalidating confirmed stories or AI inputs',()=>{
 const p=setup(),before=frameworkState(p),updated=cmd(cmd(p,{type:'settings.draft',text:'未提交的设定要求'}),{type:'bulk.draft',text:'待拆分的完整故事'});
 const restored=normalizeFrameworkProject(JSON.parse(JSON.stringify(updated)));
 assert.equal(restored.creator.framework.settingsDraft,'未提交的设定要求');assert.equal(restored.creator.framework.bulkDraft,'待拆分的完整故事');
 assert.deepEqual(restored.creator.framework.mainline,before.mainline);assert.deepEqual(restored.creator.framework.settings,before.settings);
});
