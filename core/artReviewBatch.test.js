import test from 'node:test';
import assert from 'node:assert/strict';
import {approveAllArtReviews,publishAllArtReviews,artReviewFailureSummary} from './artReviewBatch.js';
import {newArtReview,isSceneVerified} from './artReview.js';
test('bulk approval accepts missing descriptions, but never approves unread scenes',async()=>{
 const episodes=[{episodeNumber:1,content:'1-1 家\n正文'},{episodeNumber:2,content:'2-1 家\n正文'}];
 const ledger={episodes:Object.fromEntries(episodes.map(e=>[e.episodeNumber,newArtReview(e)]))};
 const item={id:'c',name:'【杰伊】',category:'character',description:'',ready:false};ledger.episodes[1].roster=[item];ledger.episodes[1].scenes[0].items=[item];
 const store={snapshot:()=>ledger,updateMany:async changes=>{for(const c of changes)ledger.episodes[c.number]=c.reduce(ledger.episodes[c.number]);}};
 const result=await approveAllArtReviews(store,episodes,'owner');assert.deepEqual(result,{count:1,skipped:1});assert.ok(isSceneVerified(ledger.episodes[1].scenes[0]));assert.ok(ledger.episodes[1].unassignedApproval);assert.ok(!isSceneVerified(ledger.episodes[2].scenes[0]));
});
test('bulk publication stops on project-wide rejection, keeps approvals, then resumes all after repair',async()=>{
 const episodes=Array.from({length:40},(_,i)=>({episodeNumber:i+1,content:`${i+1}-1 家\n正文`}));
 const ledger={episodes:Object.fromEntries(episodes.map(e=>{const r=newArtReview(e);r.scenes[0].mappingReady=true;return [e.episodeNumber,r];}))};let blocked=true,calls=0;
 const store={snapshot:()=>ledger,updateMany:async changes=>{for(const c of changes)ledger.episodes[c.number]=c.reduce(ledger.episodes[c.number]);},publish:async()=>{calls++;if(blocked)throw Error("Error invoking remote method 'collab-art-review-save': Error: 分集编号无法可靠解析、相互矛盾或重复，请核对原文编号");return {};}};
 await approveAllArtReviews(store,episodes,'owner');const first=await publishAllArtReviews(store,episodes);assert.equal(calls,1);assert.equal(first.blocked,true);assert.equal(first.failures.length,1);assert.ok(Object.values(ledger.episodes).every(r=>isSceneVerified(r.scenes[0])));
 blocked=false;const second=await publishAllArtReviews(store,episodes);assert.equal(second.count,40);assert.equal(second.failures.length,0);assert.equal(calls,41);
});
test('episode-specific rejection does not block later valid publication and repeated errors are compact',async()=>{
 const episodes=[1,2].map(n=>({episodeNumber:n,content:`${n}-1 家\n正文`})),ledger={episodes:{}};
 for(const e of episodes){const r=newArtReview(e);r.scenes[0].mappingReady=true;ledger.episodes[e.episodeNumber]=r;}
 const store={snapshot:()=>ledger,updateMany:async changes=>{for(const c of changes)ledger.episodes[c.number]=c.reduce(ledger.episodes[c.number]);},publish:async n=>{if(n===1)throw Error('本集已有其他核实修改');return {};}};
 await approveAllArtReviews(store,episodes);const result=await publishAllArtReviews(store,episodes);assert.equal(result.count,1);assert.equal(result.blocked,false);
 const summary=artReviewFailureSummary(Array.from({length:40},(_,i)=>({episode:i+1,error:"Error invoking remote method 'collab-art-review-save': Error: 分集编号无法可靠解析、相互矛盾或重复，请核对原文编号"})));
 assert.ok(summary.length<200);assert.match(summary,/40 集/);assert.doesNotMatch(summary,/Error invoking/);
});
