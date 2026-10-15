import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectCollabEpisodes,listCollabEpisodes} from './collabEpisodes.js';
import {artWorkflowState} from './artWorkflow.js';
import {getArtReviewStore,summarizeArtReview} from './artReviewPersistence.js';
import {createDirectorSync} from './cloudTraffic.js';
const episode=(id,n,content=`${n}-1 房间 日 内\n原文`)=>({id,title:`第${n}集`,content,episodeNumber:n});
const episodes=[episode('first',1),episode('old24',24),episode('new24',24,'24-1 房间 日 内\n改稿'),episode('later',25),{id:'unknown',title:'待核对资料',content:'未编号内容'}];
test('inspection isolates ambiguous episodes while keeping all original rows available for correction',()=>{
 const before=structuredClone(episodes),info=inspectCollabEpisodes(episodes);
 assert.deepEqual(info.episodes.map(e=>e.id),['first','later']);
 assert.deepEqual(info.issues.map(i=>[i.type,i.number,i.rows.map(r=>r.index)]),[['duplicate',24,[1,2]],['invalid',null,[4]]]);
 assert.equal(info.issues[0].rows[1].episode.content,episodes[2].content);assert.deepEqual(episodes,before);
 assert.throws(()=>listCollabEpisodes(episodes),/重复/);
});
test('workflow and progress render safely without declaring a broken project complete',()=>{
 const project={episodes},ledger={episodes:{}};const workflow=artWorkflowState(ledger,project);
 assert.equal(workflow.phase,'identity-conflict');assert.match(workflow.message,/核对|冲突/);
 const summary=summarizeArtReview(ledger,project);assert.match(summary.identityError,/重复/);assert.equal(summary.workflow.phase,'identity-conflict');
});
test('loading a damaged project keeps old checkpoints and only prepares unambiguous episode records',async()=>{
 let disk={episodes:{24:{status:'generated',sourceContent:'保留原核实',scenes:[],pending:true,customHistory:['原稿']}}};
 const project={id:crypto.randomUUID(),episodes},api={artReviewLoadLocal:async()=>structuredClone(disk),artReviewSaveLocal:async p=>disk=structuredClone(p.data),analysisLoad:async()=>null};
 const store=getArtReviewStore({api,projectId:project.id});await store.load(project,[]);
 assert.equal(disk.episodes[24].sourceContent,'保留原核实');assert.deepEqual(disk.episodes[24].customHistory,['原稿']);assert.ok(disk.episodes[1]&&disk.episodes[25]);
});
test('automatic local source sync refuses ambiguous input while returning the usable cloud project',async()=>{
 let writes=0;const project={id:'project',myRole:'producer',episodes:[episode('cloud',1)]};
 const result=await createDirectorSync()(project,{id:'source',episodes},async()=>{writes++;return project;});
 assert.equal(writes,0);assert.match(result.director_sync_warning,/重复/);assert.deepEqual(result.episodes,project.episodes);
});
