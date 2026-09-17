const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ui=fs.readFileSync(path.join(__dirname,'../src/v06/CollabWorkspace.jsx'),'utf8').replace(/\r\n/g,'\n');
test('restart sync entry directly calls saved-result sync without a model or old in-memory closure',async()=>{
 const match=ui.match(/async function syncPendingArtAnalysis\([\s\S]*?\n}\n/);assert.ok(match);
 let synced=0,refreshed=0;const jobs=new Map();
 const context={collabAnalysisJobs:jobs,analysisJobKey:(accountId,id)=>accountId+':'+id,syncSavedArtAnalysis:async()=>{synced++;return {pending:0,completed:80,published:80,pendingEpisodes:[],syncErrors:[],warnings:[]}},artSyncNotice:()=> '已同步80集'};
 vm.createContext(context);vm.runInContext(match[0]+';globalThis.run=syncPendingArtAnalysis;',context);
 await context.run({project:{id:'p',genre:'都市'},accountId:'a',api:{analysisLoad:async()=>({}),analysisSave:async()=>{}},assets:[],refresh:async()=>{refreshed++}});
 assert.equal(synced,1);assert.equal(refreshed,1);
});
test('restored persisted ledger distinguishes local complete from synced episodes and shows exact failures',async()=>{
 const {summarizeArtSync}=await import('../core/artAnalysisSync.js');
 const r={chunks:['x'],outputs:['saved'],published:false,syncError:'原文不一致'};
 const status=summarizeArtSync({episodes:{38:r,39:{...r,published:true,syncError:undefined}}});
 assert.deepEqual(status.pendingEpisodes,[38]);assert.equal(status.published,1);assert.match(status.syncErrors[0].error,/原文/);
 assert.match(ui,/analysisLoad[\s\S]*summarizeArtSync/);
 assert.match(ui,/analysisJobKey/);assert.match(ui,/待同步云端/);assert.match(ui,/待核对|同步说明/);
});
