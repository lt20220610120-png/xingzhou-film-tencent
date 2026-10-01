const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCloudAccessService } = require('./cloud-access-service.cjs');
test('a delayed session response cannot recreate a logged-out cloud session', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-session-race-'));
  const file = path.join(dir, 'cloud-session.json'); fs.writeFileSync(file, JSON.stringify({ token: 'test-session' }));
  let finish; const realFetch = global.fetch;
  const reply = (value) => ({ ok: true, status: 200, text: async () => JSON.stringify(value) });
  global.fetch = async (_url, options) => JSON.parse(options.body).action === 'session' ? new Promise((r) => { finish = () => r(reply({ account: { id: 'test-admin', is_admin: true } })); }) : reply({ ok: true });
  try {
    const service = createCloudAccessService(dir); const pending = service.session(); await new Promise(setImmediate); await service.logout(); finish();
    assert.equal(await pending, null); assert.equal(fs.existsSync(file), false);
  } finally { global.fetch = realFetch; fs.rmSync(dir, { recursive: true, force: true }); }
});
