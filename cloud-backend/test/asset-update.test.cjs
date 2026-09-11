const test = require('node:test');
const assert = require('node:assert/strict');
const { handleAction } = require('../src/collab.cjs');
const { createServer } = require('../src/server.cjs');

function repository(role = 'producer') {
  const saved = { id: 'asset', project_id: 'project', name: '门厅', description: '旧提示词' };
  return {
    saved,
    findBySession: async () => ({ id: 'user' }),
    getProject: async id => id === 'project' ? { id, owner_id: role === 'producer' ? 'user' : 'owner' } : null,
    findMembership: async () => ({ role }),
    isProjectLocked: async () => false,
    updateAsset: async (id, fields, uid, pid) => id === saved.id && pid === saved.project_id ? Object.assign(saved, fields) : null,
  };
}
const payload = { projectId: 'project', assetId: 'asset', updates: { description: '一层老房子，空旷门厅' } };

for (const role of ['producer', 'artist', 'artist_collaborator']) test(`${role} 可以保存嵌套 updates 中的提示词`, async () => {
  const repo = repository(role);
  const result = await handleAction('asset-update', payload, { id: 'user' }, repo);
  assert.equal(result.status, 200);
  assert.equal(repo.saved.description, payload.updates.description);
  assert.equal(repo.saved.name, '门厅');
});

test('禁止只读协作者、锁定项目和跨项目资产写入', async () => {
  assert.equal((await handleAction('asset-update', payload, { id: 'user' }, repository('collaborator'))).status, 403);
  const locked = repository(); locked.isProjectLocked = async () => true;
  assert.equal((await handleAction('asset-update', payload, { id: 'user' }, locked)).status, 423);
  assert.equal((await handleAction('asset-update', { ...payload, assetId: 'other-project-asset' }, { id: 'user' }, repository())).status, 404);
});

test('资产保存数据库故障返回保存错误，日志不包含提示词或令牌', async () => {
  const repo = repository(); const logs = [];
  repo.updateAsset = async () => { throw Object.assign(Error('private SQL text'), { code: '42702' }); };
  const server = createServer({ API_SECRET: 'test', DATABASE_URL: 'postgres://test' }, { repository: repo, mailer: null, cosSigner: null, logger: { error: (...args) => logs.push(args) } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await fetch(`http://127.0.0.1:${server.address().port}/api/gateway`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' }, body: JSON.stringify({ action: 'asset-update', ...payload }) });
    assert.equal(result.status, 503);
    assert.match((await result.json()).error, /提示词保存失败/);
    assert.deepEqual(logs, [['gateway_failed', { action: 'asset-update', code: '42702' }]]);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
