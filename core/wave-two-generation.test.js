import test from 'node:test';
import assert from 'node:assert/strict';
import {activeMediaProfile, generationMediaProfiles, setActiveMediaApi} from './canvasStore.js';
import {workflowInput} from './adminWorkflow.js';
import {parsePromptBook} from './promptBook.js';
import {storyboardGenerationInput} from './storyboardBatch.js';

test('configured Feituo credentials do not invent an audio model and the selected audio profile is restored', () => {
  const feituo={id:'ft',kind:'video',endpoint:'https://feituokuajing.com',apiKey:'fixture'};
  assert.deepEqual(generationMediaProfiles({mediaProfiles:[feituo]},'audio'),[]);
  const state=setActiveMediaApi({mediaProfiles:[feituo,{id:'one',kind:'audio'},{id:'two',kind:'audio'}]},'audio','two');
  assert.equal(activeMediaProfile(JSON.parse(JSON.stringify(state)),'audio').id,'two');
});

const profile={id:'test',kind:'video',model:'fixture-model',endpoint:'https://example.invalid',apiKey:'fixture',capabilities:{minImages:2,maxImages:3,maxAudios:1}};
const refs=[{id:'i1',kind:'image'},{id:'i2',kind:'image'},{id:'a1',kind:'audio'},{id:'a2',kind:'audio'}];
const scenePrompt='甲 @audio1\n乙 @audio2';

test('admin workflow checks the image minimum and emits only allowed audio with matching prompt aliases', () => {
  const book=parsePromptBook('【1-1-1】'+scenePrompt,'测试','a'),entry=book.entries[0];
  entry.prompt=scenePrompt;
  const settings={profileId:profile.id,model:profile.model,duration:5,ratio:'16:9',resolution:'720p'};
  book.sceneMedia={'1-1':[refs[0],...refs.slice(2)]};
  assert.throws(()=>workflowInput(book,entry,settings,profile),/至少需要 2 张/);
  book.sceneMedia['1-1']=refs;
  const input=workflowInput(book,entry,settings,profile);
  assert.deepEqual(input.references.map(r=>r.id),['i1','i2','a1']);
  assert.match(input.prompt,/@audio1/);
  assert.doesNotMatch(input.prompt,/@audio2/);
});

test('storyboard batch checks the image minimum and emits only allowed audio with matching aliases', async () => {
  const state={mediaProfiles:[profile]}, value={profileId:profile.id,model:profile.model,prompt:scenePrompt,references:refs};
  await assert.rejects(storyboardGenerationInput({state,value:{...value,references:refs.slice(1)}}),/至少需要 2 张/);
  const input=await storyboardGenerationInput({state,value});
  assert.deepEqual(input.references.map(r=>r.id),['i1','i2','a1']);
  assert.match(input.prompt,/@audio1/);
  assert.doesNotMatch(input.prompt,/@audio2/);
});
