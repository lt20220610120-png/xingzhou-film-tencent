import test from 'node:test';import assert from 'node:assert/strict';import {withStorageWork,storageWorkBusy} from './storageWork.js';
test('跨请求的流程仍阻止目录切换，失败和完成后释放',async()=>{
 let release;const pending=withStorageWork(()=>new Promise(r=>release=r));assert.equal(storageWorkBusy(),true);release();await pending;assert.equal(storageWorkBusy(),false);
 await assert.rejects(withStorageWork(async()=>{assert.equal(storageWorkBusy(),true);throw Error('failure')}));assert.equal(storageWorkBusy(),false);
});
