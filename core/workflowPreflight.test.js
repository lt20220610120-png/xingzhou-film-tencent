import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowPreflightIssues} from './workflowPreflight.js';
test('start settings reject missing model, invalid duration, missing human confirmation and unsupported downstream execution',()=>{
 const s={preflightVersion:1,profileId:'p',model:'m',aiProfileId:'ai',mode:'semi',humanConfirmed:true,duration:32,ratio:'9:16',visualStyle:'真人电影级',endStage:'archive'};
 assert.deepEqual(workflowPreflightIssues(s),[]);
 for(const delta of [{model:''},{duration:NaN},{duration:0},{humanConfirmed:false},{endStage:'edit'}])assert(workflowPreflightIssues({...s,...delta}).length);
});
