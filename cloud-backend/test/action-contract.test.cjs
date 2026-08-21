const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const Q = String.fromCharCode(39);

function collect(src, prefix) {
  const re = new RegExp(prefix + Q + '([a-z-]+)' + Q, 'g');
  const found = new Set();
  let m;
  while ((m = re.exec(src))) found.add(m[1]);
  return found;
}

test('后端实现了客户端调用的每一个协作 action', () => {
  const client = collect(read('electron/collab-service.cjs'), 'call\\(');
  const server = new Set();
  for (const f of ['collab.cjs', 'media.cjs', 'admin.cjs']) {
    for (const x of collect(read('cloud-backend/src/' + f), 'action === ')) server.add(x);
  }
  const missing = [...client].filter((x) => !server.has(x)).sort();
  assert.deepEqual(missing, [], '后端缺少 action: ' + missing.join(', '));
  assert.ok(client.size >= 40, '客户端 action 数量异常: ' + client.size);
});
