import test from 'node:test';import assert from 'node:assert/strict';
import {migrateDirectorReplies,retireDirectorReplies} from './directorLegacyReplies.js';
import {directorWorkPreview} from './directorWorkPreview.js';
const memory=()=>{const m=new Map();return{get length(){return m.size},key:i=>[...m.keys()][i],getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
test('legacy replies migrate only for current account, retire after successful save and preserve concurrent changes',()=>{
 const store=memory(),key='xz-director-manual-output:a:p:e:1-1',raw=JSON.stringify([{output:'付费返回',sourceText:'输入'}]);store.setItem(key,raw);store.setItem(key.replace(':a:',':b:'),raw);
 const state={directorProjects:[{id:'p',episodes:[{id:'e',prompts:[]}]}]};const result=migrateDirectorReplies(state,'a',store);
 assert.equal(result.state.directorProjects[0].episodes[0].manualSceneReplies[0].output,'付费返回');assert.equal(store.getItem(key),raw);
 assert.equal(migrateDirectorReplies(result.state,'a',store).state.directorProjects[0].episodes[0].manualSceneReplies.length,1);
 store.setItem(key,'changed');retireDirectorReplies(result.retired,store);assert.equal(store.getItem(key),'changed');store.setItem(key,raw);retireDirectorReplies(result.retired,store);assert.equal(store.getItem(key),null);assert.equal(store.length,1);
});
test('version preview shows director edits, visions and prompts rather than source script',()=>{
 const text=directorWorkPreview({script:'不应默认展示的整本',episodes:[{title:'第1集',quickSceneEdits:{'1-1':'快速改动'},sceneVisions:{'1-1':'导演构想'},prompts:[{label:'1-1-1',content:'生成的提示词'}],manualSceneReplies:[{sceneLabel:'1-1',output:'原始返回'}]}]});
 for(const value of ['快速改动','导演构想','生成的提示词','原始返回'])assert.ok(text.includes(value));assert.ok(!text.includes('不应默认展示的整本'));
});
test('different members migrate distinct paid replies even after shared work arrived',()=>{
 const a=memory(),b=memory(),rawA=JSON.stringify([{output:'A回包'}]),rawB=JSON.stringify([{output:'B回包'}]);a.setItem('xz-director-manual-output:a:p:e:1-1',rawA);b.setItem('xz-director-manual-output:b:p:e:1-1',rawB);
 const first=migrateDirectorReplies({directorProjects:[{id:'p',episodes:[{id:'e'}]}]},'a',a);const second=migrateDirectorReplies(first.state,'b',b);
 assert.deepEqual(second.state.directorProjects[0].episodes[0].manualSceneReplies.map(r=>r.output),['A回包','B回包']);assert.equal(migrateDirectorReplies(second.state,'b',b).state.directorProjects[0].episodes[0].manualSceneReplies.length,2);
});
import {directorLiveWork} from './directorLiveProjection.js';
test('ordinary refresh preserves archived paid work and replaces current stale history; restore clears previous tombstones',()=>{
 const p={deletedPromptIds:['restored'],promptHistory:[{id:'archived',content:'已删分集成果'},{id:'current',content:'旧词'}]};
 const eps=[{id:'e',prompts:[{id:'current',content:'新词'},{id:'restored',content:'恢复成果'}]}];const updated=directorLiveWork(p,eps);
 assert.equal(updated.promptHistory.find(p=>p.id==='archived').content,'已删分集成果');assert.equal(updated.promptHistory.find(p=>p.id==='current').content,'新词');assert.deepEqual(updated.deletedPromptIds,[]);
 const restored=directorLiveWork(p,eps,true);assert.ok(!restored.promptHistory.some(p=>p.id==='archived'));assert.ok(restored.promptHistory.some(p=>p.id==='restored'));
});
