import test from 'node:test';import assert from 'node:assert/strict';
import * as v from './voiceBinding.js';
import {parsePromptBook,mergeEpisodeMedia} from './promptBook.js';
import {beginImportedBinding,importedSnapshot,importedDecision} from './importedArtBinding.js';
import {compileEntryBinding,applyBindingAi} from './promptArtBinding.js';
const entry={id:'p',sceneId:'1-1',prompt:'小林站在门口。小王：快进来！小林（心声）：别怕。'};
const snapshot={voiceCards:[{uid:'v1',name:'小林',sceneIds:['1-1'],reference:{id:'a',kind:'audio',filePath:'D:/a.wav'}},{uid:'v2',name:'小王',sceneIds:['1-1'],reference:{id:'b',kind:'audio',filePath:'D:/b.wav'}}]};
test('speech binding only emits the actual speaker and excludes silent visible character',()=>{
 const decision=v.applyVoiceBinding(snapshot,entry,{},[{voiceUid:'v2',evidence:'小王：快进来！',kind:'dialogue'}]);
 const out=v.compileVoiceBinding(snapshot,entry,decision,{prompt:entry.prompt,references:[]});assert.deepEqual(out.references.map(r=>r.id),['b']);assert.match(out.prompt,/小王.*@audio1/);
 assert.throws(()=>v.applyVoiceBinding(snapshot,entry,{},[{voiceUid:'v1',evidence:'小林（心声）：别怕。',kind:'dialogue'}]),/正常对白/);
});
test('mixed folder association compiles only chosen audio and keeps unused audio in the folder',()=>{
 let book=mergeEpisodeMedia(parsePromptBook('【1-1-1】【基础信息】\n人物：小王\n场景：无\n道具：无\n【连续台词】\n小王：快进来！','音频测试','b'),{},{'1-1':[{id:'i',name:'小王',category:'character',kind:'image',filePath:'D:/i.png'},{id:'a',name:'小王',kind:'audio',filePath:'D:/a.wav'},{id:'b',name:'路人',kind:'audio',filePath:'D:/b.wav'}]});
 book=beginImportedBinding(book,'u');book.importedBinding.metadata.i={name:'小王',category:'character',confirmed:true};
 const s=importedSnapshot(book),e=s.entries[0],d=importedDecision(s,e);assert.equal(s.voiceCards.length,2);
 const chosen=applyBindingAi(s,e,d,{needs:d.needs.map(n=>({...n,reason:'实际入镜'})),speakers:[{voiceUid:'audio:a',evidence:'小王：快进来！',kind:'dialogue'}]});
 const out=compileEntryBinding(s,e,{...chosen,confirmed:true});assert.deepEqual(out.references.map(r=>r.id),['i','a']);assert.equal(book.sceneMedia['1-1'].length,3);
});
test('voices require explicit model decision, valid scene identity and exact evidence',()=>{
 assert.throws(()=>v.applyVoiceBinding(snapshot,entry,{},undefined),/讲话/);
 assert.throws(()=>v.applyVoiceBinding(snapshot,entry,{},[{voiceUid:'v2',evidence:'不存在',kind:'dialogue'}]),/原文/);
 const other={...snapshot,voiceCards:snapshot.voiceCards.map(v=>({...v,sceneIds:['2-1']}))};assert.throws(()=>v.applyVoiceBinding(other,entry,{},[{voiceUid:'v2',evidence:'小王：快进来！',kind:'dialogue'}]),/音色/);
 assert.equal(v.compileVoiceBinding(snapshot,entry,{speakers:[]},{prompt:entry.prompt,references:[]}).references.length,0);
});
