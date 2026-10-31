import test from 'node:test';import assert from 'node:assert/strict';import * as a from './audioReferenceSelection.js';
const input={prompt:'图@image1\n甲@audio1 乙@audio2 丙@audio3 丁@audio4 戊@audio5',references:[{id:'i',kind:'image'},...['a','b','c','d','e'].map(id=>({id,kind:'audio'}))]};
test('five voice references send three or zero according to model, preserving source for switching',()=>{
 const out=a.selectAudioReferences(input,{maxAudios:3});assert.deepEqual(out.references.map(r=>r.id),['i','a','b','c']);assert.doesNotMatch(out.prompt,/@audio[45]/);assert.match(out.prompt,/@image1/);
 assert.deepEqual(a.selectAudioReferences(input,{maxAudios:0}).references.map(r=>r.id),['i']);assert.equal(a.selectAudioReferences(input,{maxAudios:5}).references.length,6);assert.equal(input.references.length,6);assert.match(input.prompt,/@audio5/);
});
test('total reference ceiling preserves existing images then maximizes audio slots',()=>{
 const out=a.selectAudioReferences(input,{maxAudios:5,maxTotalRefs:3});assert.deepEqual(out.references.map(r=>r.id),['i','a','b']);assert.equal(out.audioReferenceSelection.omitted.length,3);
});
test('duplicate source audio and unsupported explicit aliases do not become wrong reference numbers',()=>{
 const source={prompt:'@audio1 @audio2 @audio3',references:[{id:'a',kind:'audio'},{id:'a',kind:'audio'},{id:'b',kind:'audio'}]};
 const out=a.selectAudioReferences(source,{maxAudios:2});assert.deepEqual(out.references.map(r=>r.id),['a','b']);assert.equal(out.prompt,'@audio1 @audio1 @audio2');
});
