import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreatorProject,updateCreatorEpisode,updateCreatorSection,normalizeCreatorProject,creatorInputFingerprint } from './creatorWorkspace.js';
import {runCreatorTask} from './creatorAi.js';
import {addRewriteSource,saveRewriteAnalysis,selectRewriteSources,addRewritePlan,applyRewriteVersion,rewriteSources,rewriteState,prepareRewriteTask,validateRewritePlan,removeRewriteSource} from './rewriteWorkflow.js';
const initial=()=>createCreatorProject({scriptProjects:[]},{name:'新作',mode:'rewrite'});
const plan=n=>({majorEvents:[{id:'a',title:'相遇到结局',startEpisode:1,endEpisode:n}],episodes:Array.from({length:n},(_,i)=>({number:i+1,title:`第${i+1}集`,outline:`小事件${i+1}`,eventIds:['a']}))});
test('unlimited independent sources and analyses survive normalization and reload',()=>{
 let state=initial(),id=state.scriptProjects[0].id;
 for(let i=0;i<10;i++)state=addRewriteSource(state,id,{name:`剧本${i}`,content:`第1集\n事件${i}`});
 const sources=rewriteSources(state.scriptProjects[0]);assert.equal(sources.length,10);
 state=saveRewriteAnalysis(state,id,sources[1].id,{settings:'北美现代',outline:'到达、冲突、解决',characters:'人物动机及命运'});
 const loaded=normalizeCreatorProject(JSON.parse(JSON.stringify(state)).scriptProjects[0]);
 assert.equal(rewriteSources(loaded)[1].analysis.settings,'北美现代');assert.equal(rewriteSources(loaded)[0].analysis.settings,undefined);
});
test('edition switching restores exact edits, confirmation and upstream constraints',()=>{
 let s=initial(),id=s.scriptProjects[0].id;
 s=updateCreatorSection(s,'script',id,'settings',{output:'现代都市',accepted:true});
 s=addRewritePlan(s,id,plan(2));const a=rewriteState(s.scriptProjects[0]).versions[0].id;s=applyRewriteVersion(s,id,a);
 s=updateCreatorEpisode(s,'script',id,s.scriptProjects[0].episodes[0].id,{result:'第一版修改正文',finalConfirmed:true});
 s=updateCreatorSection(s,'script',id,'settings',{output:'架空古代',accepted:true});s=addRewritePlan(s,id,plan(3));const b=rewriteState(s.scriptProjects[0]).versions[1].id;s=applyRewriteVersion(s,id,b);
 assert.equal(s.scriptProjects[0].episodes.length,3);
 s=applyRewriteVersion(s,id,a);assert.equal(s.scriptProjects[0].episodes.length,2);assert.equal(s.scriptProjects[0].episodes[0].result,'第一版修改正文');
 // Before creating B the user edited A's setting, so the saved active A includes that edit.
 assert.equal(s.scriptProjects[0].creator.sections.settings.output,'架空古代');
 s=applyRewriteVersion(s,id,b);assert.equal(s.scriptProjects[0].episodes.length,3);
});
test('legacy source, sections and manuscript preserved on first edition application',()=>{
 let s=initial(),id=s.scriptProjects[0].id;s.scriptProjects[0].episodes=[{id:'old',title:'旧集',result:'旧稿',content:'旧规划'}];
 s=addRewritePlan(s,id,plan(1));const version=rewriteState(s.scriptProjects[0]).versions[0].id;s=applyRewriteVersion(s,id,version);
 const legacy=rewriteState(s.scriptProjects[0]).versions.find(v=>v.name==='原有稿件');assert.ok(legacy);s=applyRewriteVersion(s,id,legacy.id);assert.equal(s.scriptProjects[0].episodes[0].result,'旧稿');
});
test('stage selections independent; generation reads only selected books and preceding manuscript',()=>{
 let s=initial(),id=s.scriptProjects[0].id;for(let i=0;i<3;i++)s=addRewriteSource(s,id,{name:`书${i}`,content:`原文${i}`});
 const sources=rewriteSources(s.scriptProjects[0]);s=selectRewriteSources(s,id,'settings',[sources[1].id]);
 let p=prepareRewriteTask(s.scriptProjects[0],{section:'settings'});assert.equal(p.creator.source,null);assert.equal(p.creator.references.length,1);assert.equal(p.creator.references[0].name,'书1');
 p=s.scriptProjects[0];p.episodes=[{id:'a',result:'前集事实'},{id:'b',content:'本集细纲'},{id:'c',result:'未来稿件'}];
 assert.deepEqual(prepareRewriteTask(p,{episodeId:'b'}).episodes.map(e=>e.id),['a','b']);
 const one=prepareRewriteTask(p,{task:'rewriteAnalyze',sourceId:sources[2].id});assert.equal(one.creator.source.name,'书2');assert.equal(one.creator.references.length,0);assert.deepEqual(one.creator.sections,{});
 s=removeRewriteSource(s,id,sources[1].id);assert.deepEqual(rewriteState(s.scriptProjects[0]).selections.settings,[]);
});
test('plan rejects holes, invalid causal assignment and truncated structure before touching project',()=>{
 assert.throws(()=>validateRewritePlan({episodes:[]}));const p=plan(3);p.episodes[1].number=4;assert.throws(()=>validateRewritePlan(p));
 const p2=plan(2);p2.episodes[0].eventIds=['missing'];assert.throws(()=>validateRewritePlan(p2));
 assert.deepEqual(validateRewritePlan('```json\n'+JSON.stringify(plan(1))+'\n```'),plan(1));
});
test('legacy breakdowns remain available per book, selected unanalysed books include actual source',()=>{
 let s=initial(),id=s.scriptProjects[0].id;s=addRewriteSource(s,id,{name:'旧书',content:'完整旧书'});
 delete s.scriptProjects[0].creator.source.analysis;
 s=updateCreatorSection(s,'script',id,'settings',{input:'旧版世界观拆解'});
 assert.equal(rewriteSources(s.scriptProjects[0])[0].analysis.settings,'旧版世界观拆解');
 s=addRewriteSource(s,id,{name:'新书',content:'未拆解新书原文'});const book=rewriteSources(s.scriptProjects[0])[1];
 s=selectRewriteSources(s,id,'outline',[book.id]);
 assert.equal(prepareRewriteTask(s.scriptProjects[0],{section:'outline'}).creator.references[0].content,'未拆解新书原文');
});
test('adding a pending edition does not invalidate an unrelated stage candidate',()=>{
 let s=initial(),id=s.scriptProjects[0].id;const target={section:'settings',side:'output'};
 const fp=creatorInputFingerprint(s.scriptProjects[0],target);s=addRewritePlan(s,id,plan(2));
 assert.equal(creatorInputFingerprint(s.scriptProjects[0],target),fp);
});
test('model requests honour per-stage reference isolation and never include later manuscript',async()=>{
 let s=initial(),id=s.scriptProjects[0].id;
 for(let i=1;i<=3;i++)s=addRewriteSource(s,id,{name:`书${i}`,content:`唯一本书原文${i}`});
 const p=s.scriptProjects[0],books=rewriteSources(p);s=selectRewriteSources(s,id,'outline',[books[1].id]);
 const calls=[],args={api:{aiChat:async r=>(calls.push(r),'模型结果')},state:{skills:[]},project:s.scriptProjects[0],profile:{id:'mock',model:'mock'},taskId:'qa'};
 await runCreatorTask({...args,target:{section:'outline',side:'output'}});
 const prompt=calls[0].messages.map(m=>m.content).join('\n');assert.match(prompt,/唯一本书原文2/);assert.doesNotMatch(prompt,/唯一本书原文1|唯一本书原文3/);
 const manuscript={...p,episodes:[{id:'a',title:'第1集',result:'前集实写事实'},{id:'b',title:'第2集',content:'当前详细规划'},{id:'c',title:'第3集',result:'后集未发生内容'}]};
 await runCreatorTask({...args,project:manuscript,target:{episodeId:'b',side:'output',inputSide:'input'}});
 const generated=calls[1].messages.map(m=>m.content).join('\n');assert.match(generated,/前集实写事实|当前详细规划/);assert.doesNotMatch(generated,/后集未发生内容/);
});
