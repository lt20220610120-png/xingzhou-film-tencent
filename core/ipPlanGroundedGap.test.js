import test from 'node:test';
import assert from 'node:assert/strict';
import {createIPProject,importIPNovel,getIPProject} from './ipWorkspace.js';
import {prepareIPPlanContinuityEvidence,resolveIPPlanOmittedEvidence} from './ipPlanContinuity.js';

const fixture=()=>{
 const prior='甲收到真实通知后依次核查当前物证。',first='乙带着已公开物证抵达新调查地点。',second='甲与乙核查同一原著证人提供的结果。',tail='尚未安排的后续场面不得提前当作删减。';
 const branch=Array.from({length:4500},(_,i)=>`支线素材${String(i).padStart(6,'0')}路人在市场讨论蔬菜价格，未改变主角关系身份知情。`).join('\n');
 const content=`第1章 真实主线\n${prior}\n${branch}\n${first}\n原著在两场之间明确交接证据。\n${second}\n${tail}`;
 let state=createIPProject({fruitProjects:[]},{name:'公开虚构大省略区间',duration:60});const id=state.fruitProjects[0].id;state=importIPNovel(state,id,{content});const source=getIPProject(state,id).creator.ip.source;
 const range=quote=>({start:content.indexOf(quote),end:content.indexOf(quote)+quote.length});
 const previous=[{sourceRanges:[range(prior)]}],group={episodes:[{sourceRanges:[range(first),range(second)]}]},window={start:range(first).start,end:content.length};
 const reading=[{sourceId:source.id,start:0,end:content.length,note:'完整索引：市场仅无关支线，前集通知成立；原著在两场之间明确交接证据，甲乙关系与物证知情没有跳变。'}];
 return {source,previous,group,window,reading,branch,prior,first,second,tail};
};
const indexReply=evidence=>JSON.stringify({sufficient:true,facts:'市场闲聊可删，保留两场之间交接证据这一必要前因；未确认关系不擅自推进。',evidence:evidence.noteRows.map(r=>({start:r.start,end:r.end,quote:r.note}))});
const rawReply=(request,source)=>{
 const bounds=request.stage.match(/^gap-read-(\d+)-(\d+)$/);assert.ok(bounds);
 const quote=source.content.slice(Number(bounds[1]),Number(bounds[2]));
 return JSON.stringify({complete:true,facts:'该段保留原著证据交接前因，其他市场闲聊可删；不存在未写的治疗情节。',sourceQuotes:[{startQuote:quote,endQuote:quote}]});
};

test('149k omitted branch uses one bounded purpose check without duplicating selected raw source',async()=>{
 const f=fixture(),evidence=prepareIPPlanContinuityEvidence(f);assert.ok(f.branch.length>149000);assert.equal(evidence.mode,'indexed-gap');
 assert.equal(evidence.gaps.length,2);assert.equal(evidence.gaps[0].start,f.previous[0].sourceRanges[0].end);assert.equal(evidence.gaps[1].end,f.group.episodes[0].sourceRanges[1].start);
 assert.ok(evidence.readingCoversGap);assert.ok(evidence.gapText.length<1900);assert.ok(!evidence.gapText.includes(f.tail));
 const calls=[],records=[];const result=await resolveIPPlanOmittedEvidence({source:f.source,evidence,goal:'物证交接因果',invoke:async r=>{calls.push(r);return indexReply(evidence);},onDraft:r=>records.push(r)});
 assert.equal(calls.length,1);assert.equal(calls[0].stage,'gap-index');assert.ok(calls[0].prompt.length<3500);assert.ok(!calls[0].prompt.includes(f.branch));
 assert.ok(!calls[0].prompt.includes(f.first));assert.ok(!calls[0].prompt.includes(f.second));assert.equal(result.mode,'verified-gap-index');assert.equal(result.verified,true);assert.ok(!('ok' in result));
 assert.equal(records.filter(r=>r.type==='plan-gap-facts'&&r.complete).length,1);
});

test('raw small gaps include intra-episode and inter-episode omissions but no unassigned window tail',()=>{
 const source={id:'small',content:'上一场甲领通知。未演出的关键治疗。当前乙进入病房。医生再次核对结果。下一场乙接受解释。尚未分配的未来。',chapters:[]};
 const range=quote=>({start:source.content.indexOf(quote),end:source.content.indexOf(quote)+quote.length});
 const evidence=prepareIPPlanContinuityEvidence({source,previous:[{sourceRanges:[range('上一场甲领通知。')]}],group:{episodes:[{sourceRanges:[range('当前乙进入病房。')]},{sourceRanges:[range('下一场乙接受解释。')]}]},window:{start:range('当前乙进入病房。').start,end:source.content.length}});
 assert.equal(evidence.mode,'raw-gap');assert.equal(evidence.gaps.length,2);assert.ok(evidence.gapText.includes('未演出的关键治疗。'));assert.ok(evidence.gapText.includes('医生再次核对结果。'));assert.ok(!evidence.gapText.includes('尚未分配的未来。'));
});

test('all selected gap rows must be supported; bare ok or fabricated index quotes cannot certify omissions',async()=>{
 const f=fixture(),evidence=prepareIPPlanContinuityEvidence(f),records=[];let rawCalls=0;
 const result=await resolveIPPlanOmittedEvidence({source:f.source,evidence,goal:'证据交接',invoke:async r=>r.stage==='gap-index'?JSON.stringify({sufficient:true,facts:'全部可删',evidence:[{start:0,end:f.source.content.length,quote:'索引没有记载的假证据'}]}):(rawCalls++,rawReply(r,f.source)),onDraft:r=>records.push(r)});
 assert.equal(rawCalls,evidence.rawChecks.length);assert.equal(result.mode,'verified-gap-raw');assert.equal(records.filter(r=>r.type==='plan-gap-read'&&r.complete).length,rawCalls);
 await assert.rejects(resolveIPPlanOmittedEvidence({source:f.source,evidence,invoke:async()=>'{"ok":true,"issues":[]}'}),e=>e.code==='IP_PLAN_GAP_UNRESOLVED');
});

test('missing reading coverage causes bounded raw verification and reuses completed chunks after interruption',async()=>{
 const f=fixture(),evidence=prepareIPPlanContinuityEvidence({...f,reading:[]}),records=[],calls=[];
 assert.equal(evidence.readingCoversGap,false);
 await assert.rejects(resolveIPPlanOmittedEvidence({source:f.source,evidence,goal:'公开原著因果',invoke:async r=>{calls.push(r);if(calls.length===3)throw new Error('network interrupted');return rawReply(r,f.source);},onDraft:r=>records.push(r)}),/network interrupted/);
 assert.equal(records.filter(r=>r.type==='plan-gap-read'&&r.complete).length,2);
 const resumed=[];const result=await resolveIPPlanOmittedEvidence({source:f.source,evidence,goal:'公开原著因果',diagnostics:records,invoke:async r=>{resumed.push(r);assert.ok(r.prompt.length<12700);return rawReply(r,f.source);},onDraft:r=>records.push(r)});
 assert.equal(result.mode,'verified-gap-raw');assert.equal(resumed.length,evidence.rawChecks.length-2);
 assert.ok(!resumed.some(r=>r.stage===calls[0].stage||r.stage===calls[1].stage));
 const cached=await resolveIPPlanOmittedEvidence({source:f.source,evidence,goal:'公开原著因果',diagnostics:records,invoke:async()=>assert.fail('complete scoped gap cache must be reused')});assert.equal(cached.content,result.content);
});

test('source or causal goal changes invalidate previous omitted-gap checkpoints',async()=>{
 const f=fixture(),evidence=prepareIPPlanContinuityEvidence(f),records=[];
 await resolveIPPlanOmittedEvidence({source:f.source,evidence,goal:'旧目的',invoke:async()=>indexReply(evidence),onDraft:r=>records.push(r)});
 let calls=0;await resolveIPPlanOmittedEvidence({source:f.source,evidence,goal:'新人物关系目的',diagnostics:records,invoke:async()=>{calls++;return indexReply(evidence);}});assert.equal(calls,1);
 const changed={...f.source,content:f.source.content.replace('真实通知','另一通知')};calls=0;
 await resolveIPPlanOmittedEvidence({source:changed,evidence,goal:'旧目的',diagnostics:records,invoke:async()=>{calls++;return indexReply(evidence);}});assert.equal(calls,1);
});

test('unicode raw gap chunks keep every character and never split surrogate pairs',()=>{
 const f=fixture();f.source.content=f.source.content.replace('蔬菜价格','😀蔬菜价格');f.window={start:f.source.content.indexOf(f.first),end:f.source.content.length};const at=f.source.content.indexOf(f.second);f.group.episodes[0].sourceRanges[0]={start:f.window.start,end:f.window.start+f.first.length};f.group.episodes[0].sourceRanges[1]={start:at,end:at+f.second.length};
 const e=prepareIPPlanContinuityEvidence({...f,rawGapLimit:129});
 for(const r of e.rawChecks){assert.ok(r.end-r.start<=129);assert.ok(!/^[\uDC00-\uDFFF]/.test(f.source.content.slice(r.start,r.end)));assert.ok(!/[\uD800-\uDBFF]$/.test(f.source.content.slice(r.start,r.end)));}
 assert.equal(e.rawChecks.map(r=>f.source.content.slice(r.start,r.end)).join(''),e.gaps.map(r=>f.source.content.slice(r.start,r.end)).join(''));
});
