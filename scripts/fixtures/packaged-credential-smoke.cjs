const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { verifyDeviceProof } = require('../../cloud-backend/shared/software-license.cjs');

const account = {
  id: 'packaged-profile-fixture', username: 'profile_fixture', display_name: '隔离凭据测试',
  email: 'profile@example.invalid', roles: ['creator'], active_role: 'creator',
  created_at: '2026-01-01T00:00:00.000Z',
};
const token = 'isolated-profile-session';
const card = 'XZ-01234567-01234567-01234567-01234567-01234567-01234567';
const password = 'fixture-password';
const fields = ['cloud-session.json', 'software-device-key.json', 'software-license-card.json'];
const connectionFixtures = {
  'like-connector/browser-token.enc': 'c'.repeat(64),
  ['libtv/accounts/' + 'd'.repeat(32) + '/credentials.enc']: JSON.stringify({ token: 'isolated-libtv-fixture' }),
};

function mockGateway(expectedPublicKey) {
  const seen = { login: 0, session: 0, verifiedProofs: 0 };
  const nonces = new Map();
  let publicKey = expectedPublicKey;
  const fetch = async (_url, options) => {
    const { action, _licenseProof, ...payload } = JSON.parse(String(options.body || '{}'));
    const bearer = String(options.headers?.Authorization || '').replace(/^Bearer /i, '');
    const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
    const denied = () => response({ error: 'isolated fixture request denied' }, 401);
    if (action === 'license-route') return response({ status: 'monthly', allowed: false, authenticated: bearer === token });
    if (action === 'license-challenge') {
      if (!publicKey) publicKey = payload.publicKey;
      if (!publicKey || payload.publicKey !== publicKey) return denied();
      const nonce = crypto.randomUUID();
      nonces.set(nonce, publicKey);
      return response({ nonce });
    }
    if (_licenseProof) {
      const key = nonces.get(_licenseProof.nonce);
      nonces.delete(_licenseProof.nonce);
      if (!key || key !== _licenseProof.publicKey || !verifyDeviceProof({
        action, payload, token: bearer, nonce: _licenseProof.nonce,
        publicKey: key, signature: _licenseProof.signature,
      })) return denied();
      seen.verifiedProofs++;
    }
    if (action === 'license-check') return response(_licenseProof && bearer === token
      ? { status: 'active', allowed: true, authenticated: true, expiresAt: '2099-01-01T00:00:00.000Z', leaseSeconds: 60 }
      : { status: 'required', allowed: false, authenticated: false });
    if (action === 'license-prepare' && _licenseProof && payload.code === card) return response({ activationToken: 'isolated-activation', expiresIn: 300 });
    if (action === 'login' && _licenseProof && payload.username === account.username && payload.password === password) {
      seen.login++;
      return response({ token, account });
    }
    if (action === 'session' && _licenseProof && bearer === token) {
      seen.session++;
      return response({ account });
    }
    if (bearer === token && /-list$/.test(action)) return response([]);
    if (bearer === token && action === 'producer-status') return response({ isProducer: false });
    return denied();
  };
  return { fetch, seen, publicKey: () => publicKey };
}

function credentials(directory, safeStorage) {
  const read = (name, version) => {
    const saved = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
    assert.equal(saved.version, version);
    const cipher = Buffer.from(saved.encrypted, 'base64');
    assert.equal(cipher.subarray(0, 3).toString('ascii'), 'v10');
    return safeStorage.decryptString(cipher);
  };
  const session = JSON.parse(read(fields[0], 2));
  const device = JSON.parse(read(fields[1], 1));
  assert.ok(session.token === token && session.account.id === account.id, 'native session identity changed');
  assert.equal(read(fields[2], 1), card);
  assert.equal(crypto.createPublicKey(device.privateKey).export({ type: 'spki', format: 'pem' }), device.publicKey);
  return device.publicKey;
}

function configure(app, root, phase) {
  assert.ok(['upgrade', 'fresh-write', 'fresh-restart'].includes(phase), 'invalid packaged credential fixture phase');
  const fixtureRoot = fs.realpathSync(root);
  const fixtureParent = path.dirname(fixtureRoot);
  const expectedName = phase === 'upgrade' ? 'historical' : 'fresh';
  assert.ok(path.basename(fixtureRoot) === expectedName &&
    path.basename(fixtureParent).startsWith('xz-profile-') &&
    path.dirname(fixtureParent) === fs.realpathSync(os.tmpdir()), 'credential fixture must use an isolated temporary root');
  const appData = path.join(root, 'appData');
  const profile = path.join(appData, '行舟影视-腾讯云版');
  for (const [name, dir] of Object.entries({
    appData, userData: profile, sessionData: profile,
    documents: path.join(root, 'documents'), temp: path.join(root, 'temp'),
  })) {
    fs.mkdirSync(dir, { recursive: true });
    app.setPath(name, dir);
  }
  const expectedFile = path.join(root, 'device-public-key.pem');
  const gateway = mockGateway(phase === 'fresh-write' ? undefined : fs.readFileSync(expectedFile, 'utf8'));
  globalThis.fetch = async () => { throw new Error('Network disabled during packaged credential verification'); };
  app.commandLine.appendSwitch('disable-background-networking');
  // main.cjs configures its transport during evaluation. Replace it before main's ready handler starts.
  app.whenReady().then(() => {
    require('../../electron/cloud-access-service.cjs').configureCloudFetch(gateway.fetch);
    require('electron').session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, done) => done({ cancel: true }));
  });
  const report = { version: app.getVersion(), phase };
  let finished = false;
  const finish = error => {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    report.success = !error;
    if (error) report.error = error.message;
    fs.writeFileSync(path.join(root, 'credential-report-' + phase + '.json'), JSON.stringify(report, null, 2));
    app.quit();
    setTimeout(() => app.exit(error ? 1 : 0), 1500).unref();
  };
  const deadline = setTimeout(() => finish(Error('Packaged credential verification timed out')), 28000);
  app.on('browser-window-created', (_, window) => {
    window.webContents.once('did-finish-load', async () => {
      try {
        if (phase === 'fresh-write') {
          const login = { username: account.username, password };
          const expression = '(async()=>{await window.xingzhou.licensePrepare({code:' + JSON.stringify(card) +
            '}); return window.xingzhou.authLogin(' + JSON.stringify(login) + ');})()';
          const loggedIn = await window.webContents.executeJavaScript(expression);
          assert.equal(loggedIn.id, account.id);
        }
        const workspace = "Boolean(document.querySelector('.v06-app:not([hidden]) #app-sidebar'))";
        let opened = false;
        for (let i = 0; i < 100 && !opened; i++) {
          opened = await window.webContents.executeJavaScript(workspace);
          if (!opened) await delay(120);
        }
        assert.ok(opened, 'fixture workspace failed to open');
        assert.ok(gateway.seen.session > 0 && gateway.seen.verifiedProofs > 0, 'renderer never verified the session and device');
        assert.equal(gateway.seen.login, phase === 'fresh-write' ? 1 : 0, 'startup unexpectedly submitted a login');
        const currentKey = credentials(profile, require('electron').safeStorage);
        assert.equal(currentKey, gateway.publicKey(), 'packaged app changed the bound device');
        if (phase === 'fresh-write') fs.writeFileSync(expectedFile, currentKey);
        Object.assign(report, { opened, nativeCredentialFiles: fields.length, ...gateway.seen });
        finish();
      } catch (error) { finish(error); }
    });
  });
  return true;
}

module.exports = { configure, mockGateway, account, token, card, password, fields, credentials, connectionFixtures };
