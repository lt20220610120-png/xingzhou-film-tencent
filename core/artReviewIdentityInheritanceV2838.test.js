import test from 'node:test';
import assert from 'node:assert/strict';
import {newArtReview,needsArtReviewDetails} from './artReview.js';
import {fillArtReviewDetails} from './artReviewRunner.js';

const wardrobe='服装：白色实验室长褂、深灰长裤；妆造：棕灰后梳短发、金丝眼镜。';
const complete='脸型骨相与五官：窄长脸、平直眉、细长眼、鼻梁微弯、薄唇；身形与肤质：清瘦、冷白肤色；'+wardrobe;
const card=(overrides={})=>({id:'character:【博士-研究制服】',category:'character',name:'【博士-研究制服】',description:wardrobe,ready:true,manual:false,...overrides});
const episode=n=>({episodeNumber:n,content:`${n}-1 实验室 日 内\n博士出现。`});
function fixture(){
 const episodes=[episode(1),episode(2),episode(3)],records={};
 for(const ep of episodes){const r=newArtReview(ep);r.roster=[card()];r.unassigned=[card()];records[ep.episodeNumber]=r;}
 const calls=[],store={snapshot:()=>({episodes:records}),update:async(n,fn)=>{records[n]=fn(records[n]);}};
 const api={aiChat:async payload=>{calls.push(payload);return {ok:true,output:JSON.stringify({items:[{...card(),description:complete,visible:true}]})};}};
 return {records,calls,episodes,args:{store,project:{episodes},genre:'现代',profile:{id:'mock'},api,job:{}}};
}
test('first episode repair supplies the exact same actor identity to the next episode without another AI call',async()=>{
 const f=fixture();
 assert.deepEqual(await fillArtReviewDetails({...f.args,episode:f.episodes[0]}),[]);
 assert.equal(f.calls.length,1);
 assert.deepEqual(await fillArtReviewDetails({...f.args,episode:f.episodes[1]}),[]);
 assert.equal(f.calls.length,1,'same-name prior identity must not be redesigned at another charge');
 const inherited=f.records[2].roster[0];
 assert.equal(inherited.description,complete);assert.equal(needsArtReviewDetails(inherited),false);
 assert.ok(inherited.alternatives.some(a=>a.description===wardrobe));
 assert.ok(f.records[2].history.some(h=>h.reason==='继承前集已补齐信息卡'&&h.sourceEpisode===1));
});
test('future cards, changed source, other category and aliases never supply a guessed identity',async()=>{
 for(const mismatch of ['future','source','category','alias']){
  const f=fixture();
  const prior=f.records[mismatch==='future'?3:1];
  prior.roster=[card({description:complete,...(mismatch==='category'?{category:'prop'}:{}),...(mismatch==='alias'?{name:'【另一称呼-研究制服】'}:{})})];prior.unassigned=prior.roster;
  if(mismatch==='source')prior.sourceContent='旧正文';
  await fillArtReviewDetails({...f.args,episode:f.episodes[1]});
  assert.equal(f.calls.length,1,mismatch);
 }
});
test('explicit manual version stays untouched while inheritance fills only automatic incomplete cards',async()=>{
 const f=fixture();f.records[1].roster=[card({description:complete})];f.records[1].unassigned=f.records[1].roster;
 f.records[2].roster=[card({manual:true})];f.records[2].unassigned=f.records[2].roster;
 await fillArtReviewDetails({...f.args,episode:f.episodes[1]});
 assert.equal(f.calls.length,0);assert.equal(f.records[2].roster[0].description,wardrobe);
});
