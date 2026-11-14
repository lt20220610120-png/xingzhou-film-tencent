const test=require('node:test'),assert=require('node:assert/strict');
const {createSnapshotCache}=require('./cloud-snapshots.cjs');
test('conditional reads are account scoped and reconstructed without sharing mutable objects',()=>{
 const cache=createSnapshotCache();
 const request=cache.prepare('project-get',{projectId:'p'},'alice');
 const value=cache.resolve(request,{_xzSnapshot:{revision:'a',value:{script:'original'}}});
 value.script='local edit';
 const next=cache.prepare('project-get',{projectId:'p'},'alice');
 assert.equal(next.headers['x-xingzhou-known-revision'],'a');
 assert.deepEqual(cache.resolve(next,{_xzSnapshot:{revision:'a',unchanged:true}}),{script:'original'});
 assert.equal(cache.prepare('project-get',{projectId:'p'},'bob').headers['x-xingzhou-known-revision'],undefined);
 assert.equal(cache.prepare('assets-list',{projectId:'p'},'alice'),null);
 assert.deepEqual(cache.resolve(next,{script:'older server'}),{script:'older server'});
});

test('large collaborative project snapshots are retained for conditional reads',()=>{
 const cache=createSnapshotCache(),value={script:'大型项目'.repeat(4*1024*1024)};
 const first=cache.prepare('project-get',{projectId:'large'},'alice');
 cache.resolve(first,{_xzSnapshot:{revision:'a',value}});
 const next=cache.prepare('project-get',{projectId:'large'},'alice');
 assert.equal(next.headers['x-xingzhou-known-revision'],'a');
 assert.equal(cache.resolve(next,{_xzSnapshot:{revision:'a',unchanged:true}}).script,value.script);
});
