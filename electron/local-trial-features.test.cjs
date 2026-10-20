const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { retainPrivateTrial, readLocalTrialFeatures } = require('./local-trial-features.cjs');

test('private trial survives public upgrades on that device; fresh users remain off', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-trial-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(retainPrivateTrial(root, { version: '2.8.55', xingzhouPrivateTrial: false }), false);
  assert.equal(fs.readdirSync(root).length, 0);
  assert.equal(retainPrivateTrial(root, { version: '2.8.54-private.1', xingzhouPrivateTrial: true }), true);
  const before = fs.readFileSync(path.join(root, 'local-trial-features.json'), 'utf8');
  assert.equal(retainPrivateTrial(root, { version: '2.8.55', xingzhouPrivateTrial: false }), true);
  assert.equal(fs.readFileSync(path.join(root, 'local-trial-features.json'), 'utf8'), before);
  assert.equal(readLocalTrialFeatures(path.join(root, 'another-device')), false);
});
