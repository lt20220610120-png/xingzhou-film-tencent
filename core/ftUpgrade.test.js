import test from 'node:test';import assert from 'node:assert/strict';
import {upgradeLegacyFtConnections,FT_CONNECTIONS} from './ftUpgrade.js';
import {updateMediaProfile,historicalMediaProfile,generationMediaProfiles} from './canvasStore.js';
test('all legacy workspaces get five blank-key links once, retain old job credentials and isolate other accounts',()=>{
 const before={directorProjects:[{id:'user-project'}],skills:[{id:'custom'}],activeVideoApiId:'old-video',mediaProfiles:[{id:'old-video',kind:'video',endpoint:'https://feituokuajing.com',apiKey:'old-key'},{id:'old-image',kind:'image',endpoint:'https://feituokuajing.com',apiKey:''},{id:'other',kind:'video',endpoint:'https://other.invalid',apiKey:'other-key'}]};
 const after=upgradeLegacyFtConnections(before);assert.equal(after.mediaProfiles.length,8);assert.deepEqual(after.directorProjects,before.directorProjects);assert.deepEqual(after.skills,before.skills);
 assert(FT_CONNECTIONS.every(p=>after.mediaProfiles.find(a=>a.id===p.id).apiKey===''));assert.equal(historicalMediaProfile(after,'old-image').apiKey,'old-key');assert(!generationMediaProfiles(after,'video').some(p=>p.id==='old-video'));assert.strictEqual(upgradeLegacyFtConnections(after),after);
 const separate={...after,mediaProfiles:after.mediaProfiles.map(p=>p.id===FT_CONNECTIONS[4].id?{...p,apiKey:'second-account'}:p)};const saved=updateMediaProfile(separate,FT_CONNECTIONS[0].id,{apiKey:'new-key'});
 assert.equal(saved.mediaProfiles.find(p=>p.id===FT_CONNECTIONS[4].id).apiKey,'second-account');assert.equal(saved.mediaProfiles.find(p=>p.id===FT_CONNECTIONS[1].id).apiKey,'new-key');assert.equal(saved.mediaProfiles.find(p=>p.id==='old-video').apiKey,'old-key');assert.equal(saved.mediaProfiles.find(p=>p.id==='other').apiKey,'other-key');
 assert.equal(upgradeLegacyFtConnections({...before,clientEdition:'clean-v1'}).mediaProfiles.length,3);
});
