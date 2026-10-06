import test from 'node:test';
import assert from 'node:assert/strict';
import {readRewriteMainline,validateRewriteMainline,rewriteMainlineText,outlineEventOptions,outlineGroupCode} from './rewriteMainline.js';
import {moveOutlineGroup,moveOutlineEvent} from './rewriteOutline.js';
import {createInitialState,normalizeState} from './projectStore.js';
import {createCreatorProject,updateCreatorSection,appendCreatorRecord,adoptCreatorRecord,creatorInputFingerprint,buildCreatorText} from './creatorWorkspace.js';
import {addRewriteSource,saveRewriteAnalysis,prepareRewriteTask} from './rewriteWorkflow.js';
import {buildCreatorContext} from './creatorAi.js';

const macro={groups:[{id:'g1',title:'相遇',goal:'从陌生到认识',events:[{id:'e1',title:'捡包',summary:'拾得遗失物',purpose:'引出失主'},{id:'e2',title:'还包',summary:'联系失主',purpose:'建立认识的因果'}]},{id:'g2',title:'相爱',goal:'建立信任',events:[{id:'e3',title:'共同应对困难',summary:'合作',purpose:'感情变化'}]}]};
const line={eventGroups:[{id:'line1',groupId:'g1',eventId:'e1',title:'捡包',episodes:[{number:1,title:'第1集',outline:'发现并拾得遗失物。'},{number:2,title:'第2集',outline:'决定寻找失主。'}]},{id:'line2',groupId:'g1',eventId:'e2',title:'还包',episodes:[{number:3,title:'第3集',outline:'联系失主并物归原主。'}]}]};
const setup=()=>{let s=createCreatorProject(createInitialState(),{mode:'rewrite',name:'归组'});const id=s.scriptProjects[0].id;s=addRewriteSource(s,id,{name:'对标',content:'第1集\n1-1 房间 日\n甲捡包。'});return {s,id,source:s.scriptProjects[0].creator.source.id};};
test('stage labels follow stable identities when major events and small events move',()=>{
 assert.equal(outlineGroupCode(26),'AA');assert.equal(outlineGroupCode(51),'AZ');
 assert.equal(outlineEventOptions(macro)[0].code,'A1');
 const reordered=moveOutlineGroup(macro,'g1',1);
 assert.match(rewriteMainlineText(line,reordered),/【B1：捡包】/);
 const transferred=moveOutlineEvent(macro,'g1','e1','g2');
 assert.match(rewriteMainlineText(line,transferred),/B2：捡包/);assert.equal(validateRewriteMainline(line,transferred).eventGroups[0].groupId,'g2');
 assert.equal(validateRewriteMainline(line,macro).eventGroups[0].episodes.length,2);
});
test('legacy prose round trips losslessly and malformed structured output cannot be adopted as prose',()=>{
 const prose='# 旧主线\r\n\r\n第1—2集：捡包。';
 assert.equal(readRewriteMainline(prose).legacyText,prose);assert.equal(rewriteMainlineText(prose),prose);
 assert.throws(()=>readRewriteMainline('{"eventGroups":['),/未能识别/);
});
test('duplicates, unmapped events and empty episode outlines reject before state changes',()=>{
 for(const bad of [{eventGroups:[...line.eventGroups,line.eventGroups[0]]},{eventGroups:[{...line.eventGroups[0],eventId:'unknown'}]},{eventGroups:[{...line.eventGroups[0],episodes:[{number:0,outline:'x'}]}]},{eventGroups:[{...line.eventGroups[0],episodes:[{number:1,outline:'x'},{number:1,outline:'y'}]}]}])assert.throws(()=>validateRewriteMainline(bad,macro));
});
test('per-book analysis saves independent structures and a mainline run fingerprints its exact skeleton',()=>{
 let {s,id,source}=setup();s=saveRewriteAnalysis(s,id,source,{macroOutline:macro},'macroOutline');
 const p=s.scriptProjects[0],target={section:'rewriteAnalysis',task:'rewriteAnalyze',sourceId:source,analysisStage:'outline'};
 const fp=creatorInputFingerprint(p,target),prepared=prepareRewriteTask(p,target);
 assert.match(prepared.creator.references[0].content,/"id":"e1"/);assert.deepEqual(prepared.creator.sections,{});
 s=saveRewriteAnalysis(s,id,source,{outline:line},'outline');assert.equal(creatorInputFingerprint(s.scriptProjects[0],target),fp);
 s=saveRewriteAnalysis(s,id,source,{macroOutline:moveOutlineGroup(macro,'g1',1)},'macroOutline');assert.notEqual(creatorInputFingerprint(s.scriptProjects[0],target),fp);
});
test('adoption, reload, human edits and exports preserve group links and readable episode text',()=>{
 let {s,id}=setup();s=updateCreatorSection(s,'script',id,'macroOutline',{output:JSON.stringify(macro),accepted:true});
 const p=s.scriptProjects[0],target={section:'outline',side:'output'};
 const structuredTarget={...target,format:'rewriteMainline'};
 s=appendCreatorRecord(s,'script',id,{id:'malformed',projectId:id,type:'ai',target:structuredTarget,output:'AI 未按结构返回的普通段落',inputFingerprint:creatorInputFingerprint(p,structuredTarget)});
 assert.throws(()=>adoptCreatorRecord(s,'script',id,'malformed'),/小事件分组/);
 s=appendCreatorRecord(s,'script',id,{id:'candidate',projectId:id,type:'ai',target,output:JSON.stringify(line),inputFingerprint:creatorInputFingerprint(p,target)});
 s=adoptCreatorRecord(s,'script',id,'candidate');s=normalizeState(JSON.parse(JSON.stringify(s)));
 const restored=s.scriptProjects[0];assert.equal(readRewriteMainline(restored.creator.sections.outline.output).eventGroups[0].eventId,'e1');
 const text=buildCreatorText(restored,'script','output',{includeSections:true});assert.match(text,/A1：捡包/);assert.match(text,/第2集/);assert.ok(!text.includes('eventGroups'));
 const context=buildCreatorContext(restored,{target:{section:'outline'}});assert.match(context,/"id":"e1"/);
 const changed=structuredClone(line);changed.eventGroups[0].episodes[0].outline='人工改写。';
 s=updateCreatorSection(s,'script',id,'outline',{output:JSON.stringify(changed),accepted:false});assert.match(s.scriptProjects[0].creator.sections.outline.output,/人工改写/);
});
test('restoring an unfinished manual mainline keeps it an unaccepted draft',()=>{
 let {s,id}=setup();s=appendCreatorRecord(s,'script',id,{id:'draft-history',type:'history',target:{section:'outline',side:'output'},output:'{"eventGroups":[]}',previousAccepted:false});
 s=adoptCreatorRecord(s,'script',id,'draft-history');assert.equal(s.scriptProjects[0].creator.sections.outline.accepted,false);assert.deepEqual(readRewriteMainline(s.scriptProjects[0].creator.sections.outline.output).eventGroups,[]);
});
