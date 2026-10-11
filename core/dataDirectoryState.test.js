import test from 'node:test';
import assert from 'node:assert/strict';
import {stateForDataDirectory} from './projectStore.js';
test('切换到已有资料目录只采用目标项目与目标备份，不混入旧目录',()=>{
 const target={directorProjects:[{id:'same',name:'目标正文',updatedAt:'2025-01-01'}],scriptProjects:[{id:'target-creator'}]};
 const state=stateForDataDirectory(target,[{id:'secondary',name:'目标导演备份'}]);
 assert.deepEqual(state.directorProjects.map(p=>p.id),['same','secondary']);assert.equal(state.directorProjects[0].name,'目标正文');assert.equal(state.scriptProjects[0].id,'target-creator');
});
