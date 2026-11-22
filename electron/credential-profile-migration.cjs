const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const LEGACY_PROFILES = ['行舟影视（腾讯云版）', '行舟影视'];
const MAX_FILE_BYTES = 1024 * 1024;
const chromiumVersion = Buffer.from('v10');
const dpapiPrefix = Buffer.from('DPAPI');
const utf8 = new TextDecoder('utf-8', { fatal: true });
const jsonObject = text => {
  const value = JSON.parse(text);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
};

// Use the current Windows user's DPAPI. The command is constant and no credential is
// passed as a command-line argument. Output is captured privately by the main process.
const DPAPI_COMMAND = Buffer.from(`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$protectedKeys = ConvertFrom-Json ([Console]::In.ReadToEnd())
$keys = @()
foreach ($protectedKey in @($protectedKeys)) {
  try {
    $protectedBytes = [Convert]::FromBase64String($protectedKey)
    $key = [Security.Cryptography.ProtectedData]::Unprotect($protectedBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    if ($key.Length -eq 32) { $keys += [Convert]::ToBase64String($key) }
    [Array]::Clear($key, 0, $key.Length)
  } catch {}
}
[Console]::Out.Write((ConvertTo-Json -InputObject $keys -Compress))
`, 'utf16le').toString('base64');

function unprotectWindowsKeys(blobs) {
  const systemDirectory = process.env.SystemRoot || 'C:\\Windows';
  const powershell = path.win32.join(systemDirectory, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise(resolve => {
    const child = execFile(powershell,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', DPAPI_COMMAND],
      { windowsHide: true, timeout: 6000, maxBuffer: 16384 },
      (error, stdout) => {
        try {
          if (error) return resolve([]);
          const keys = JSON.parse(stdout);
          resolve(Array.isArray(keys) ? keys.map(value => Buffer.from(value, 'base64')).filter(key => key.length === 32) : []);
        } catch { resolve([]); }
      });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(blobs.map(blob => blob.toString('base64'))));
  });
}

function isLocalDirectory(file) {
  try { return fs.lstatSync(file).isDirectory(); } catch { return false; }
}

function readFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error('Invalid credential file');
  return fs.readFileSync(file);
}

function legacyKeyBlobs(appData, userData) {
  const result = [];
  for (const profile of LEGACY_PROFILES) {
    const directory = path.join(appData, profile);
    if (path.resolve(directory) === path.resolve(userData) || !isLocalDirectory(directory)) continue;
    try {
      const state = jsonObject(readFile(path.join(directory, 'Local State')).toString('utf8'));
      const key = Buffer.from(state.os_crypt.encrypted_key, 'base64');
      if (key.length > dpapiPrefix.length && key.length <= 4096 && key.subarray(0, dpapiPrefix.length).equals(dpapiPrefix)) {
        result.push(key.subarray(dpapiPrefix.length));
      }
    } catch {}
  }
  return result;
}

function deviceIdentity(text) {
  const value = jsonObject(text);
  const privateKey = crypto.createPrivateKey(value.privateKey);
  const publicKey = crypto.createPublicKey(value.publicKey);
  return privateKey.asymmetricKeyType === 'ed25519'
    && crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' })
      .equals(publicKey.export({ type: 'spki', format: 'der' }));
}

function credentialFiles(userData) {
  const entries = [
    { file: path.join(userData, 'cloud-session.json'), version: 2, valid: text => {
      const token = jsonObject(text)?.token;
      return typeof token === 'string' && token.length > 0;
    } },
    { file: path.join(userData, 'software-device-key.json'), version: 1, valid: deviceIdentity },
    { file: path.join(userData, 'software-license-card.json'), version: 1, valid: text => text.trim().length > 0 },
  ];
  const like = path.join(userData, 'like-connector');
  if (isLocalDirectory(like)) entries.push({ file: path.join(like, 'browser-token.enc'), valid: text => /^[a-f0-9]{64}$/.test(text) });
  const libtv = path.join(userData, 'libtv'), accounts = path.join(libtv, 'accounts');
  if (!isLocalDirectory(libtv) || !isLocalDirectory(accounts)) return entries;
  for (const account of fs.readdirSync(accounts, { withFileTypes: true })) {
    if (!account.isDirectory() || !/^[a-f0-9]{32}$/.test(account.name)) continue;
    entries.push({ file: path.join(accounts, account.name, 'credentials.enc'), valid: text => !!jsonObject(text) });
  }
  return entries;
}

function readEncrypted(entry) {
  const raw = readFile(entry.file);
  const envelope = entry.version && jsonObject(raw.toString('utf8'));
  if (entry.version && (envelope?.version !== entry.version || typeof envelope.encrypted !== 'string')) return null;
  const ciphertext = envelope ? Buffer.from(envelope.encrypted, 'base64') : raw;
  if (ciphertext.length <= 31 || !ciphertext.subarray(0, 3).equals(chromiumVersion)) return null;
  return { ...entry, raw, envelope, ciphertext };
}

function recoverString(ciphertext, keys) {
  for (const key of keys) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, ciphertext.subarray(3, 15));
      decipher.setAuthTag(ciphertext.subarray(-16));
      const plaintext = Buffer.concat([decipher.update(ciphertext.subarray(15, -16)), decipher.final()]);
      try { return utf8.decode(plaintext); } finally { plaintext.fill(0); }
    } catch {}
  }
  return null;
}

function reseal(entry, value, safeStorage) {
  const encrypted = safeStorage.encryptString(value);
  if (safeStorage.decryptString(encrypted) !== value) return;
  const bytes = entry.envelope
    ? JSON.stringify({ ...entry.envelope, encrypted: encrypted.toString('base64') })
    : encrypted;
  const temporary = `${entry.file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
    if (readFile(entry.file).equals(entry.raw)) fs.renameSync(temporary, entry.file);
  } finally {
    try { fs.unlinkSync(temporary); } catch {}
  }
}

async function repairWindowsCredentials({ safeStorage, appData, userData, platform = process.platform, unprotect = unprotectWindowsKeys }) {
  if (platform !== 'win32' || !safeStorage?.isEncryptionAvailable() || !isLocalDirectory(userData)) return;
  const blobs = legacyKeyBlobs(appData, userData);
  if (!blobs.length) return;
  const pending = [];
  for (const entry of credentialFiles(userData)) {
    try {
      const candidate = readEncrypted(entry);
      if (!candidate) continue;
      try { safeStorage.decryptString(candidate.ciphertext); } catch { pending.push(candidate); }
    } catch {}
  }
  if (!pending.length) return;
  const keys = await unprotect(blobs);
  try {
    for (const entry of pending) {
      try {
        const value = recoverString(entry.ciphertext, keys);
        if (value !== null && entry.valid(value)) reseal(entry, value, safeStorage);
      } catch {}
    }
  } finally {
    for (const key of keys) key.fill(0);
  }
}

module.exports = { repairWindowsCredentials };
