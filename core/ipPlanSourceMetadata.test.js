import test from 'node:test';
import assert from 'node:assert/strict';
import {createIPProject,importIPNovel,getIPProject,addIPEpisode,updateIPMapping,updateIPDraft,adoptIPVersion,appendIPVersion} from './ipWorkspace.js';

const fixture=()=>{
 let state=createIPProject({fruitProjects:[]},{name:'版本真实原句元数据',duration:60}),id=state.fruitProjects[0].id;
 state=importIPNovel(state,id,{content:'第1章 来信\n秦川收到父亲留下的信封，决定先去医院核实情况。\n妹妹站在医院门口等待，随后一起走进诊室询问医生。\n'});
 state=addIPEpisode(state,id);const p=getIPProject(state,id),source=p.creator.ip.source,e=p.episodes[1];
 const first='秦川收到父亲留下的信封，决定先去医院核实情况。',second='妹妹站在医院门口等待，随后一起走进诊室询问医生。';
 e.sourceId=source.id;e.chapterIds=[source.chapters[0].id];e.outline='取得来信';e.sourceQuotes=[{startQuote:first,endQuote:first}];e.sourceRanges=[{start:source.content.indexOf(first),end:source.content.indexOf(first)+first.length}];
 state=updateIPDraft(state,id,e.id,'原先完整正文和对白');
 return {state,id,e,source,first,second,secondRange:[{start:source.content.indexOf(second),end:source.content.indexOf(second)+second.length}]};
};

test('manual source changes preserve the prior full quote provenance without retaining those quotes on the new cut',()=>{
 let {state,id,e,source,secondRange}=fixture();state=updateIPMapping(state,id,e.id,[source.chapters[0].id],'医院门口',secondRange);
 const current=getIPProject(state,id).episodes[1];assert.equal(current.sourceQuotes,undefined);assert.deepEqual(current.ipVersions.at(-1).sourceQuotes,e.sourceQuotes);assert.equal(current.ipVersions.at(-1).content,'原先完整正文和对白');
});

test('adopting a historical numeric-only version clears newer quote metadata and preserves the current complete provenance',()=>{
 let {state,id,e,source,secondRange}=fixture();getIPProject(state,id).episodes[1].ipVersions=[{id:'legacy',content:'历史医院正文',sourceId:source.id,chapterIds:e.chapterIds,sourceRanges:secondRange,outline:'医院门口'}];
 state=adoptIPVersion(state,id,e.id,'legacy');const current=getIPProject(state,id).episodes[1];
 assert.equal(current.sourceQuotes,undefined);assert.ok(current.ipVersions.some(v=>v.content==='原先完整正文和对白'&&JSON.stringify(v.sourceQuotes)===JSON.stringify(e.sourceQuotes)));
});

test('activating a newly audited different range cannot carry old planner quotes into the new version',()=>{
 let {state,id,e,source,secondRange}=fixture();state=appendIPVersion(state,id,e.id,{content:'新的医院正文',sourceId:source.id,chapterIds:e.chapterIds,sourceRanges:secondRange,generationKey:'audited-new-range'},{activate:true});
 const current=getIPProject(state,id).episodes[1];assert.equal(current.sourceQuotes,undefined);assert.equal(current.ipVersions.at(-1).sourceQuotes,undefined);assert.deepEqual(current.ipVersions.at(-1).sourceRanges,secondRange);
 assert.ok(current.ipVersions.some(v=>v.content==='原先完整正文和对白'&&JSON.stringify(v.sourceQuotes)===JSON.stringify(e.sourceQuotes)));
});
