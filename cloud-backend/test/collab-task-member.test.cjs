const test = require('node:test');
const assert = require('node:assert/strict');
const {handleAction} = require('../src/collab.cjs');
const {createRepository} = require('../src/postgres-repository.cjs');

function fixture(genre='[COLLAB_PROJECT]') {
  const project = {id:'project', owner_id:'owner', genre};
  const writes = [];
  const client = {
    async query(sql, params) {
      if (sql.startsWith('select p.*') || sql.startsWith('select p.id,p.owner_id')) return {rows:[project]};
      if (/^(insert|update|delete) /i.test(sql)) {
        writes.push({sql, params});
        return {rows:[{id:'updated-row'}]};
      }
      return {rows:[]};
    },
    release() {}
  };
  const repo = createRepository('', {pool:{connect:async()=>client, query:client.query}});
  repo.getProject = async()=>project;
  repo.isProjectLocked = async()=>false;
  const action = (name, payload)=>handleAction(name,{projectId:project.id,...payload},{id:'owner'},repo);
  return {action,writes};
}

test('task assignment and completion use distinct statements and desktop payload fields',async()=>{
  const {action,writes} = fixture();
  assert.equal((await action('task-assign',{episode:3,title:'episode',memberUserId:'artist',memberName:'Artist'})).status,200);
  assert.match(writes[0].sql,/^insert into collab_tasks/i);
  assert.deepEqual(writes[0].params,['project',3,'episode','artist','Artist','进行中','owner']);
  for (const status of ['已完成','进行中']) {
    assert.equal((await action('task-update',{taskId:'task',updates:{status}})).status,200);
    const {sql,params} = writes.at(-1);
    assert.match(sql,/^update collab_tasks/i);
    assert.match(sql,/done_at/i);
    assert.match(sql,/project_id=\$1 and id=\$2/);
    assert.match(sql,/owner_id=\$4/);
    assert.deepEqual(params,['project','task',status,'owner']);
  }
  assert.notEqual((await action('task-update',{updates:{status:'进行中'}})).status,200);
  assert.equal(writes.length,3);
  assert.equal((await action('task-update',{id:'legacy-task',status:'已完成'})).status,200);
  assert.deepEqual(writes[3].params,['project','legacy-task','已完成','owner']);
});

test('member operations distinguish row ID from legacy account ID in both project domains',async()=>{
  for(const [actionName,genre] of [['director-member-remove','[DIRECTOR_PROJECT]'],['member-remove','[COLLAB_PROJECT]'],['member-role','[COLLAB_PROJECT]']]) {
    for(const [target,column] of [[{memberId:'row',userId:'unrelated'},'id'],[{userId:'account'},'user_id']]) {
      const {action,writes}=fixture(genre);
      assert.equal((await action(actionName,{...target,role:'artist'})).status,200);
      assert.equal(writes.length,1);
      assert.match(writes[0].sql,new RegExp('and '+column+'=\\$[23]'));
      assert.match(writes[0].sql,/role\s*<>\s*'producer'/);
      assert(writes[0].params.includes(target.memberId||target.userId));
      assert(!writes[0].params.includes('unrelated'));
    }
  }
});
