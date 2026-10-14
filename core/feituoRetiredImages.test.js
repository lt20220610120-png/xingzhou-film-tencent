import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaModelChoices} from './modelChoices.js';
import models from './feituo-models.json' with {type:'json'};
const retired=new Set(['ft-image-v1-f8adc2592e629c78741d2f34a2d27115','ft-image-v1-b87d4d06a1a007a11198413608450b91','ft-image-v1-c77f458ef2701fbb8ae2ed80bfedb7b5','ft-image-v1-74d4dfbdf0ee6d78c8683dc14c528f04']);
test('confirmed retired Feituo image IDs never reappear through a saved video credential or stale image profile',()=>{
 const video={id:'ft-video',kind:'video',endpoint:'https://feituokuajing.com',model:'video-model',apiKey:'fixture'};
 for(const mediaProfiles of [[video],[video,{...video,id:'old-image',kind:'image',model:[...retired][0]}]]){
  const choices=mediaModelChoices({mediaProfiles},'image');assert.ok(choices.length>0);assert.ok(choices.every(m=>!retired.has(m.model)));assert.ok(choices.some(m=>m.model==='ft-image-v1-d45fd3842e5079ee21665888db69f2e2'));assert.ok(choices.some(m=>m.model==='ft-image-v1-5d5f9502cca8487b0a81210c9b76fc75'));
 }
 assert.ok(models.every(m=>!retired.has(m.id)));
});
