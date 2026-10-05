import test from 'node:test';
import assert from 'node:assert/strict';
import {readCollabNavigation,rememberCollabNavigation,restoredCollabEpisode} from './collabNavigation.js';
test('episode and scene survive section remount, isolated per account and project',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},scope={accountId:'a',projectId:'p',section:'art-review'};
 rememberCollabNavigation(scope,{episodeNumber:4,scenes:{4:'4-2'}},storage);
 assert.deepEqual(readCollabNavigation(scope,storage),{episodeNumber:4,scenes:{4:'4-2'}});
 assert.deepEqual(readCollabNavigation({...scope,projectId:'other'},storage),{});
 assert.deepEqual(readCollabNavigation({...scope,accountId:'b'},storage),{});
 assert.equal(restoredCollabEpisode(4,[{episodeNumber:1},{episodeNumber:4}]),4);
 assert.equal(restoredCollabEpisode(4,[{episodeNumber:7}]),7);
});
test('unavailable or corrupt storage does not interrupt navigation',()=>{
 const scope={projectId:'p',section:'art-review'};
 assert.deepEqual(readCollabNavigation(scope,{getItem:()=>'{broken'}),{});
 assert.doesNotThrow(()=>rememberCollabNavigation(scope,{episodeNumber:3},{getItem(){throw Error();},setItem(){throw Error();}}));
});
