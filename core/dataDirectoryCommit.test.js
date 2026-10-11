import test from 'node:test';import assert from 'node:assert/strict';import {commitDirectoryChange} from './dataDirectoryCommit.js';
test('后台任务在复制期间完成时取消目录激活，保留原目录新增结果',async()=>{
 const original={result:''},current={result:'刚完成的提示词'},calls=[];
 await assert.rejects(commitDirectoryChange({snapshot:original,getState:()=>current,prepared:{migrationId:'id'},api:{commitDataDir:()=>calls.push('commit'),cancelDataDir:()=>calls.push('cancel')}}),/新的编辑或生成结果/);
 assert.deepEqual(calls,['cancel']);assert.equal(current.result,'刚完成的提示词');
});
test('只有状态未变时才激活新目录',async()=>{const state={};assert.deepEqual(await commitDirectoryChange({snapshot:state,getState:()=>state,prepared:{migrationId:'id'},api:{commitDataDir:async()=>({state:{id:'target'}})}}),{state:{id:'target'}});});
