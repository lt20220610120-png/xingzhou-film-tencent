const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('both registration paths share field validation before account or card side effects', () => {
  const auth = read('cloud-backend/src/auth.cjs');
  const license = read('cloud-backend/src/software-license-repository.cjs');
  assert.match(auth, /validateRegistration/);
  assert.match(license, /validateRegistration/);
  assert.ok(auth.indexOf('const invalid = validateRegistration') < auth.indexOf('if (!await verifyEmailCode'));
  assert.ok(license.indexOf('validateRegistration') < license.indexOf('select email,code_hash'));
});

test('collaboration empty state is scoped to project hub and spans the list grid', () => {
  const css = read('src/collab.css');
  assert.match(css, /\.collab-empty\{[^}]*padding:44px 20px[^}]*\}/);
  assert.match(css, /\.collab-hub-refined \.collab-project-grid>\.collab-empty\{[^}]*grid-column:1\/ -1|\.collab-hub-refined \.collab-project-grid>\.collab-empty\{[^}]*grid-column:1\/-1/);
  assert.doesNotMatch(css.match(/^\.collab-empty\{[^}]*\}/m)?.[0] || '', /min-height:360px/);
});

test('project list sync button stays in header flow and cannot cover title', () => {
  const css = read('src/collab.css');
  const jsx = read('src/v06/CollabWorkspace.jsx');
  assert.match(jsx, /className="secondary collab-sync-button"/);
  assert.match(css, /\.collab-hub header \.collab-sync-button\{[^}]*margin-left:auto/);
  assert.doesNotMatch(css, /\.collab-hub header \.collab-sync-button\{[^}]*position:absolute/);
});

test('director empty states do not inherit project-hub minimum height', () => {
  const css = read('src/collab.css');
  assert.match(css, /\.collab-hub-refined \.collab-project-grid>\.collab-empty/);
  assert.doesNotMatch(css, /^\.collab-project-grid>\.collab-empty/m);
  assert.doesNotMatch(css, /\.collab-empty:not\(/);
});
