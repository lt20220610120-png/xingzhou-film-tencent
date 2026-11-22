const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const asar = require('@electron/asar');
const { fields, connectionFixtures } = require('./fixtures/packaged-credential-smoke.cjs');
const legacyFields = [...fields, ...Object.keys(connectionFixtures)];

// Usage: node scripts/verify-packaged-credential-upgrade.cjs <7za.exe> <194-installer.exe> <197-installer.exe> [198-installer.exe]
// Direct extraction of the NSIS contents avoids registering or replacing the user's installed Windows app.
async function verify(zip, oldInstaller, brokenInstaller, fixedInstaller) {
  assert.equal(process.platform, 'win32', 'native DPAPI fixture requires Windows');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-profile-'));
  const history = path.join(root, 'historical');
  fs.mkdirSync(history);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.XINGZHOU_SMOKE_TEST_ROOT;
  delete env.XINGZHOU_SMOKE_CREDENTIAL_PHASE;
  delete env.XINGZHOU_SMOKE_STARTUP_ONLY;
  const extract = (installer, destination, onlyAsar) => {
    fs.mkdirSync(destination, { recursive: true });
    execFileSync(zip, ['x', path.resolve(installer), '-y', '-o' + destination, ...(onlyAsar ? ['resources/app.asar'] : [])], { windowsHide: true, stdio: 'pipe' });
    return path.join(destination, 'resources', 'app.asar');
  };
  const args = [
    'electron/cloud-access-service.cjs', 'electron/cloud-config.public.cjs', 'electron/cloud-snapshots.cjs',
    'electron/session-store.cjs', 'electron/software-license-client.cjs',
    'cloud-backend/shared/software-license.cjs',
  ];
  const files = asarPath => new Set(asar.listPackage(asarPath).map(file => file.replace(/^[\\/]/, '').replaceAll('\\', '/')));
  const oldSources = (installer, version, historicalCommit) => {
    const dir = path.join(root, version);
    const archive = extract(installer, dir, true);
    assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).version, version);
    const entry = asar.extractFile(archive, path.join('electron', 'main.cjs')).toString();
    const profileSwitch = entry.indexOf("app.setPath('userData'");
    const ready = entry.indexOf('app.whenReady()');
    assert.ok(profileSwitch >= 0 && ready >= 0);
    assert.equal(profileSwitch > ready, version === '2.8.194');
    const available = files(archive);
    for (const name of [...args, 'cloud-backend/shared/cloud-config.public.cjs']) {
      if (!available.has(name)) continue;
      const source = asar.extractFile(archive, path.normalize(name));
      const candidate = path.join(dir, name);
      fs.mkdirSync(path.dirname(candidate), { recursive: true });
      fs.writeFileSync(candidate, source);
      if (name === 'electron/session-store.cjs' || name === 'electron/software-license-client.cjs') {
        const exact = execFileSync('git', ['show', historicalCommit + ':' + name],
          { cwd: path.resolve(__dirname, '..'), windowsHide: true, encoding: 'utf8' });
        assert.equal(source.toString().replaceAll('\r\n', '\n'), exact.replaceAll('\r\n', '\n'));
      }
    }
    return dir;
  };
  const run = (exe, childArgs, patch, tag) => new Promise((resolve, reject) => {
    const log = fs.openSync(path.join(root, tag + '.log'), 'w');
    const child = spawn(exe, childArgs, { env: { ...env, ...patch }, windowsHide: true, stdio: ['ignore', log, log] });
    fs.closeSync(log);
    const timer = setTimeout(() => { child.kill(); reject(Error(tag + ' exceeded 40 seconds')); }, 40000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); if (code === 0) resolve(); else reject(Error(tag + ' exited ' + code)); });
  });
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const nativeProfile = base => path.join(base, 'appData', '行舟影视-腾讯云版');
  const snapshot = (base, files) => files.map(file => crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(base, file))).digest('hex'));
  const historyDriver = path.join(__dirname, 'probe-historical-credential-profile.cjs');
  const verifyStage = async (stage, base, bundle = '') => {
    await run(require('electron'), [historyDriver], {
      XINGZHOU_QA_HISTORY_ROOT: base, XINGZHOU_QA_HISTORY_BUNDLE: bundle, XINGZHOU_QA_HISTORY_STAGE: stage,
    }, stage);
    const report = read(path.join(base, stage + '.json'));
    assert.equal(report.success, true, JSON.stringify(report));
    return report;
  };

  try {
    const seeded = await verifyStage('seed-194', history, oldSources(oldInstaller, '2.8.194', '31149c7'));
    const before = snapshot(nativeProfile(history), legacyFields);
    const oldState = path.join(history, 'appData', '行舟影视（腾讯云版）');
    const oldLocalState = read(path.join(oldState, 'Local State')).os_crypt.encrypted_key;
    assert.ok(oldLocalState.length > 0, 'the historical profile needs a DPAPI-protected Chromium key');
    const broken = await verifyStage('probe-197', history, oldSources(brokenInstaller, '2.8.197', '023544d'));
    const canonicalKey = read(path.join(nativeProfile(history), 'Local State')).os_crypt.encrypted_key;
    assert.ok(canonicalKey.length > 0 && oldLocalState !== canonicalKey, 'legacy and canonical Chromium profiles must have distinct keys');
    assert.deepEqual(snapshot(nativeProfile(history), legacyFields), before, '197 must leave old encrypted envelopes untouched');
    const results = { root, seeded, broken, distinctProfileKeys: true, preservedAtFailure: true };
    if (fixedInstaller) {
      const fixedDir = path.join(root, 'fixed');
      const archive = extract(fixedInstaller, fixedDir, false);
      const pkg = JSON.parse(asar.extractFile(archive, 'package.json'));
      assert.ok(!Array.from(files(archive)).some(name => /packaged-credential-smoke|probe-profile-workspace|scripts\/fixtures/.test(name)), 'QA auth driver must stay outside the release package');
      assert.match(asar.extractFile(archive, path.join('electron', 'packaged-smoke.cjs')).toString(), /Outbound gateway blocked by the startup smoke test/);
      const executables = fs.readdirSync(fixedDir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.exe'));
      assert.equal(executables.length, 1, 'installer must contain one app executable at the payload root');
      const exe = path.join(fixedDir, executables[0].name);
      const packaged = path.join(root, 'packaged');
      const packagedProfile = path.join(packaged, 'userData');
      const packagedLegacy = path.join(packaged, 'appData', path.basename(oldState));
      for (const dir of [packagedProfile, packagedLegacy]) fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(path.join(oldState, 'Local State'), path.join(packagedLegacy, 'Local State'));
      fs.copyFileSync(path.join(history, 'device-public-key.pem'), path.join(packaged, 'device-public-key.pem'));
      for (const file of ['Local State', ...legacyFields]) {
        const target = path.join(packagedProfile, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(nativeProfile(history), file), target);
      }
      await run(exe, [], { XINGZHOU_SMOKE_TEST_ROOT: packaged, XINGZHOU_SMOKE_STARTUP_ONLY: '1' }, 'packaged-startup');
      results.packagedStartup = read(path.join(packaged, 'report.json'));
      assert.equal(results.packagedStartup.version, pkg.version);
      assert.ok(results.packagedStartup.startup && results.packagedStartup.success, JSON.stringify(results.packagedStartup));
      results.packagedNative = await verifyStage('probe-fixed', packaged);
      const repaired = snapshot(packagedProfile, legacyFields);
      assert.ok(repaired.every((hash, index) => hash !== before[index]), 'legacy ciphertext must be resealed under the active profile');
      assert.equal(read(path.join(packagedLegacy, 'Local State')).os_crypt.encrypted_key, oldLocalState);
      assert.equal(read(path.join(packagedProfile, 'Local State')).os_crypt.encrypted_key, canonicalKey);
      results.preservedProfileKeys = true;
      const runPhase = async (phase, base) => {
        await run(require('electron'), [path.join(__dirname, 'probe-profile-workspace.cjs')], {
          XINGZHOU_SMOKE_TEST_ROOT: base, XINGZHOU_SMOKE_CREDENTIAL_PHASE: phase,
        }, phase);
        const report = read(path.join(base, 'credential-report-' + phase + '.json'));
        assert.equal(report.version, pkg.version);
        assert.equal(report.success, true, JSON.stringify(report));
        return report;
      };
      results.sourceWorkspaceUpgrade = await runPhase('upgrade', history);
      const fresh = path.join(root, 'fresh');
      fs.mkdirSync(fresh);
      results.sourceFreshWrite = await runPhase('fresh-write', fresh);
      const freshBytes = snapshot(nativeProfile(fresh), fields);
      results.sourceFreshRestart = await runPhase('fresh-restart', fresh);
      assert.deepEqual(snapshot(nativeProfile(fresh), fields), freshBytes, 'native credentials rewritten despite no account change');
      results.freshFilesUnchangedAfterRestart = true;
    }
    fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(results, null, 2));
    return results;
  } catch (error) {
    throw Error('Credential verification failed in ' + root + ': ' + error.message, { cause: error });
  }
}

if (require.main === module) verify(...process.argv.slice(2)).then(report => console.log(JSON.stringify(report, null, 2))).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
module.exports = { verify };
