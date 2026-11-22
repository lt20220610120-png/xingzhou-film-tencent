import test from 'node:test';
import assert from 'node:assert/strict';
import {API_PROVIDERS} from './apiProviders.js';
import {mergePersistedState,normalizeState} from './projectStore.js';

const retired={id:'legacy-work',provider:'doubaoWork',name:'旧账号',modelName:'turbo',reasoningEffort:'high'};
const retained={id:'retained',provider:'openai',name:'现用接口',model:'fixture-model',endpoint:'https://example.invalid',apiKey:'synthetic'};

test('legacy Doubao configuration is archived outside the available models without changing project and chat references',()=>{
 const chats=[{id:'chat',profileId:retired.id,messages:[{role:'user',content:'旧对话'}]}];
 const projects=[{id:'series',name:'旧项目',skillId:'selected-skill',apiProfileId:retired.id,episodes:[{id:'e1',content:'旧剧本'}]}];
 const next=normalizeState({apiProfiles:[retired,retained],activeApiId:retired.id,chatSessions:chats,directorProjects:projects});
 assert.equal(Object.hasOwn(API_PROVIDERS,retired.provider),false);
 assert.equal(next.activeApiId,null);
 assert.deepEqual(next.apiProfiles,[retained]);
 assert.deepEqual(next.retiredApiProfiles,[retired]);
 assert.deepEqual(next.chatSessions,chats);
 assert.equal(next.directorProjects[0].apiProfileId,retired.id);
 assert.equal(next.directorProjects[0].skillId,'selected-skill');
 assert.deepEqual(next.directorProjects[0].episodes,projects[0].episodes);
 assert.deepEqual(normalizeState(next),next);
});

test('same-workspace browser archive is retained without reverting the configured disk default',()=>{
 const next=mergePersistedState({apiProfiles:[retired],activeApiId:retired.id},{apiProfiles:[retained],activeApiId:retained.id});
 assert.deepEqual(next.retiredApiProfiles,[retired]);
 assert.equal(next.activeApiId,retained.id);
 assert.deepEqual(next.apiProfiles,[retained]);
 assert.equal(mergePersistedState({apiProfiles:[retired]},{apiProfiles:[retained]},{recoverRecycle:false}).retiredApiProfiles,undefined);
});
