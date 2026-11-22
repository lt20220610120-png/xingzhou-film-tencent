const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage, session } = require('electron');
const { mockGateway, account, card, password, fields, credentials, connectionFixtures } = require('./fixtures/packaged-credential-smoke.cjs');

const stage = process.env.XINGZHOU_QA_HISTORY_STAGE;
const root = path.resolve(process.env.XINGZHOU_QA_HISTORY_ROOT);
assert.ok(['seed-194', 'probe-197', 'probe-fixed'].includes(stage));
const packaged = stage === 'probe-fixed';
assert.ok(path.basename(root) === (packaged ? 'packaged' : 'historical') && path.basename(path.dirname(root)).startsWith('xz-profile-'));
const appData = path.join(root, 'appData');
const old = path.join(appData, '行舟影视（腾讯云版）');
const canonical = packaged ? path.join(root, 'userData') : path.join(appData, '行舟影视-腾讯云版');
for (const dir of [appData, old, canonical]) fs.mkdirSync(dir, { recursive: true });
app.setName('行舟影视（腾讯云版）');
app.setPath('appData', appData);
app.setPath('userData', stage === 'seed-194' ? old : canonical);
if (stage !== 'seed-194') app.setPath('sessionData', canonical);
app.commandLine.appendSwitch('disable-background-networking');
globalThis.fetch = async () => { throw new Error('Network disabled during isolated historical credential verification'); };

const report = { stage, chrome: process.versions.chrome, electron: process.versions.electron };
const finish = error => {
  report.success = !error;
  if (error) report.error = error.message;
  fs.writeFileSync(path.join(root, stage + '.json'), JSON.stringify(report, null, 2));
  app.quit();
};

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, done) => done({ cancel: true }));
  assert.ok(safeStorage.isEncryptionAvailable(), 'native encryption must be available');
  if (packaged) {
    assert.equal(credentials(canonical, safeStorage), fs.readFileSync(path.join(root, 'device-public-key.pem'), 'utf8'));
    for (const [relative, expected] of Object.entries(connectionFixtures)) {
      const bytes = fs.readFileSync(path.join(canonical, relative));
      assert.equal(bytes.subarray(0, 3).toString('ascii'), 'v10');
      assert.equal(safeStorage.decryptString(bytes), expected);
    }
    report.nativeCredentialFiles = fields.length + Object.keys(connectionFixtures).length;
    report.originalDeviceIdentity = true;
    finish();
    return;
  }
  if (stage === 'seed-194') app.setPath('userData', canonical);
  const bundle = path.resolve(process.env.XINGZHOU_QA_HISTORY_BUNDLE);
  const accessModule = require(path.join(bundle, 'electron/cloud-access-service.cjs'));
  const makeLicenseClient = require(path.join(bundle, 'electron/software-license-client.cjs')).createLicenseClient;
  const gateway = mockGateway();
  accessModule.configureCloudFetch(gateway.fetch);
  const access = accessModule.createCloudAccessService(app.getPath('userData'), { safeStorage });
  const licensing = makeLicenseClient({
    directory: app.getPath('userData'), safeStorage, call: accessModule.gateway,
    token: access.token, version: stage === 'seed-194' ? '2.8.194' : '2.8.197',
  });
  accessModule.setLicenseDecorator(licensing.decorate);
  if (stage === 'seed-194') {
    await licensing.prepare(card);
    const loggedIn = await access.login({ username: account.username, password });
    assert.equal(loggedIn.id, account.id);
    licensing.authenticated();
    assert.equal((await licensing.check()).status, 'active');
    const originalKey = credentials(canonical, safeStorage);
    assert.equal(originalKey, gateway.publicKey());
    fs.writeFileSync(path.join(root, 'device-public-key.pem'), originalKey);
    for (const [relative, plaintext] of Object.entries(connectionFixtures)) {
      const target = path.join(canonical, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, safeStorage.encryptString(plaintext));
    }
    report.v10Files = fields.length + Object.keys(connectionFixtures).length;
    report.historicalProfile = path.basename(old);
  } else {
    assert.equal(access.readSession(), null);
    assert.equal(licensing.rememberedCard(), '');
    for (const field of fields) {
      const cipher = JSON.parse(fs.readFileSync(path.join(canonical, field), 'utf8')).encrypted;
      assert.throws(() => safeStorage.decryptString(Buffer.from(cipher, 'base64')), '197 should not decrypt ' + field);
    }
    for (const relative of Object.keys(connectionFixtures)) {
      const bytes = fs.readFileSync(path.join(canonical, relative));
      assert.equal(bytes.subarray(0, 3).toString('ascii'), 'v10');
      assert.throws(() => safeStorage.decryptString(bytes), '197 should not decrypt ' + relative);
    }
    assert.equal((await licensing.check()).status, 'required');
    assert.ok(safeStorage.decryptString(safeStorage.encryptString('canonical-fixture')) === 'canonical-fixture');
    report.unreadableV10Files = fields.length + Object.keys(connectionFixtures).length;
    report.canonicalEncryptionUsable = true;
  }
  finish();
}).catch(finish);
