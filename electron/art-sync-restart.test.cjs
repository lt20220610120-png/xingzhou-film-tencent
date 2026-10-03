const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ui=fs.readFileSync(path.join(__dirname,'../src/v06/CollabWorkspace.jsx'),'utf8').replace(/\r\n/g,'\n');
test('analysis completion retains local candidates without a cloud refresh or implicit publication',async()=>{
 const match=ui.match(/async function startCollabArtAnalysis\([\s\S]*?\n}\n/);assert.ok(match);
 let analyzed=0,refreshed=0;const jobs=new Map();
 const context={collabAnalysisJobs:jobs,analysisJobKey:(accountId,id)=>accountId+':'+id,listCollabEpisodes:()=>[{episodeNumber:1}],runAnalysis:async()=>{analyzed++;return {pending:1,completed:1,published:0,pendingEpisodes:[1],errors:[]};},artSyncNotice:()=> '本机已保存',readableCloudError:e=>e.message};
 vm.createContext(context);vm.runInContext(match[0]+';globalThis.run=startCollabArtAnalysis;',context);
 const result=await context.run({project:{id:'p',genre:'都市'},accountId:'a',profile:{id:'model',model:'mock'},api:{},assets:[],genre:'都市',refresh:async()=>{refreshed++}});
 assert.equal(analyzed,1);assert.equal(refreshed,0);assert.equal(result.published,0);assert.equal(result.pending,1);assert.equal(result.status,'completed');
});
test('restored persisted ledger distinguishes local complete from synced episodes and shows exact failures',async()=>{
 const {summarizeArtSync}=await import('../core/artAnalysisSync.js');
 const r={chunks:['x'],outputs:['saved'],published:false,syncError:'原文不一致'};
 const status=summarizeArtSync({episodes:{38:r,39:{...r,published:true,syncError:undefined}}});
 assert.deepEqual(status.pendingEpisodes,[38]);assert.equal(status.published,1);assert.match(status.syncErrors[0].error,/原文/);
 assert.match(ui,/store.load[\s\S]*summarizeArtReview/);
 assert.match(ui,/analysisJobKey/);assert.match(ui,/本地未发布内容/);assert.match(ui,/待核对|分析说明/);
});

function refreshFixture(){
 const match=ui.match(/const refreshProject = useCallback\(async[\s\S]*?\n  }, \[project\?\.id, loadProjects, state\.directorProjects\]\);/);assert.ok(match);
 const applied=[],reads=[],ref={current:'project-a'},section={current:'art'},cursor={current:0},flight={current:null},syncs=[];
 let resolveRead;const gate=new Promise(resolve=>{resolveRead=resolve;});
 const context={useCallback:fn=>fn,project:{id:'project-a'},currentProjectIdRef:ref,currentSectionRef:section,refreshRequestRef:cursor,refreshInFlight:flight,state:{directorProjects:[]},api:{collabGetProject:async p=>{reads.push(p.projectId);await gate;return {id:p.projectId};},collabListAssets:async()=>[]},syncDirector:{current:async p=>{syncs.push(p.id);return p;}},normalizeArtAssets:a=>a,projectPublishedReviewAssets:(p,a)=>a,setProject:p=>applied.push(p),setAssets:a=>applied.push(a),writeCache:()=>{},setRefreshNotice:()=>{},loadProjects:async()=>{},localStorage:{removeItem:()=>{}}};
 vm.createContext(context);vm.runInContext(match[0]+';globalThis.refresh=refreshProject;',context);
 return {ref,section,cursor,reads,applied,syncs,resolveRead,refresh:context.refresh};
}
test('a late publication callback cannot refresh or reopen the project that was left',async()=>{
 const f=refreshFixture();f.ref.current='project-b';await f.refresh({manual:true});assert.equal(f.reads.length,0);assert.equal(f.applied.length,0);assert.equal(f.cursor.current,0);
});
test('an in-flight project refresh cannot replace a different project opened while awaiting the cloud',async()=>{
 const f=refreshFixture();const pending=f.refresh({manual:true});f.ref.current='project-b';f.resolveRead();await pending;assert.deepEqual(f.reads,['project-a']);assert.equal(f.applied.length,0);assert.equal(f.syncs.length,0);
});
test('entering local review gates a queued or in-flight automatic cloud refresh before director synchronization',async()=>{
 const queued=refreshFixture();queued.section.current='art-review';await queued.refresh();assert.equal(queued.reads.length,0);assert.equal(queued.syncs.length,0);
 const active=refreshFixture(),pending=active.refresh();active.section.current='art-review';active.resolveRead();await pending;assert.equal(active.syncs.length,0);assert.equal(active.applied.length,0);
});
test('explicit publication refresh still loads published assets while the local review page is active',async()=>{
 const f=refreshFixture();f.section.current='art-review';const pending=f.refresh({manual:true});f.resolveRead();await pending;assert.deepEqual(f.reads,['project-a']);assert.equal(f.applied.length,2);assert.deepEqual(f.syncs,['project-a']);
});
