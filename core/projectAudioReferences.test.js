import test from 'node:test';
import assert from 'node:assert/strict';
import * as library from './generationReferences.js';

test('project audio library includes all adopted identities regardless of scene, excludes pending and foreign voices',()=>{
 const media=[{id:'upload',kind:'audio',project_id:'p',filename:'环境.wav',url:'https://fixture/env.wav'},{id:'foreign',kind:'audio',projectId:'other',url:'https://fixture/foreign.wav'}];
 const voiceCards=[
  {uid:'voice:林',sceneIds:['2-9'],reference:{id:'voice:林:a',name:'林音色',kind:'audio',projectId:'p',filePath:'D:/林.wav'}},
  {uid:'voice:林::child',reference:{id:'voice:林::child:b',name:'林 · 年幼音色',kind:'audio',projectId:'p',url:'https://fixture/child.wav'}},
  {uid:'voice:pending',pendingAudio:true,reference:{id:'pending',kind:'audio',projectId:'p'}},
  {reference:{id:'other',kind:'audio',projectId:'other',url:'https://fixture/private.wav'}}
 ];
 const rows=library.projectAudioReferences?.(media,voiceCards,'p')||[];
 assert.deepEqual(rows.map(r=>r.id),['voice:林:a','voice:林::child:b','upload']);
 assert.equal(rows[0].filePath,'D:/林.wav');assert.equal(rows[1].name,'林 · 年幼音色');assert.equal(rows[2].name,'环境.wav');
 assert.equal(rows[0].adoptedVoice,true);
});

test('replacing adopted sample refreshes the identity once and keeps normal uploads',()=>{
 const media=[{id:'upload',kind:'audio',note:'普通音频',url:'https://fixture/upload.wav'}];
 const ref={id:'voice:林:new',kind:'audio',name:'林音色',projectId:'p',url:'https://fixture/new.wav'};
 const rows=library.projectAudioReferences?.(media,[{reference:ref},{reference:ref}],'p')||[];
 assert.deepEqual(rows.map(r=>r.id),['voice:林:new','upload']);
});
