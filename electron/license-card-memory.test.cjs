const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLicenseClient } = require('./software-license-client.cjs');

function fixture(call) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-card-memory-'));
  const client = createLicenseClient({
    directory,
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`sealed:${value}`, 'utf8'),
      decryptString: (buffer) => buffer.toString('utf8').replace(/^sealed:/, ''),
    },
    call: call || (async (action) => (action === 'license-prepare' ? { activationToken: 'a', expiresIn: 900 } : {})),
    token: () => '',
    version: '2.8.152',
  });
  return { client, directory, close: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

test('成功的卡密验证会加密记住卡密，下次启动无需重新输入', async () => {
  const f = fixture();
  try {
    assert.equal(f.client.rememberedCard(), '');
    await f.client.prepare('  XZ-CARD-1234  ');
    assert.equal(f.client.rememberedCard(), 'XZ-CARD-1234');
    const stored = fs.readFileSync(path.join(f.directory, 'software-license-card.json'), 'utf8');
    assert.equal(stored.includes('XZ-CARD-1234'), false, '卡密不得以明文写入磁盘');
    assert.equal(f.client.forgetCard().forgotten, true);
    assert.equal(f.client.rememberedCard(), '');
    assert.equal(fs.existsSync(path.join(f.directory, 'software-license-card.json')), false);
  } finally { f.close(); }
});

test('卡密验证失败不会覆盖或新增已记住的卡密', async () => {
  let fail = false;
  const f = fixture(async (action) => {
    if (action !== 'license-prepare') return {};
    if (fail) throw new Error('卡密无效或已被使用');
    return { activationToken: 'a', expiresIn: 900 };
  });
  try {
    await f.client.prepare('GOOD-CARD');
    fail = true;
    await assert.rejects(f.client.prepare('BAD-CARD'), /卡密无效/);
    assert.equal(f.client.rememberedCard(), 'GOOD-CARD');
  } finally { f.close(); }
});

test('不可用的系统加密不会明文落盘', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-card-noseal-'));
  const client = createLicenseClient({
    directory,
    safeStorage: { isEncryptionAvailable: () => false, encryptString: () => Buffer.from(''), decryptString: () => '' },
    call: async (action) => (action === 'license-prepare' ? { activationToken: 'a', expiresIn: 900 } : {}),
    token: () => '',
    version: '2.8.152',
  });
  try {
    await client.prepare('PLAIN-CARD');
    assert.equal(fs.existsSync(path.join(directory, 'software-license-card.json')), false);
    assert.equal(client.rememberedCard(), '');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
