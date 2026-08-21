const crypto = require('node:crypto');

const CODE_TTL_MS = 10 * 60 * 1000;

const hashEmailCode = (code) => crypto.createHash('sha256').update(String(code || '').trim()).digest('hex');
const generateEmailCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const codeExpiry = (now = Date.now()) => new Date(now + CODE_TTL_MS).toISOString();

function emailCodeValid(saved, submitted) {
  if (!saved || !submitted) return false;
  if (new Date(saved.expires_at).getTime() <= Date.now()) return false;
  const expected = Buffer.from(String(saved.code_hash || ''), 'utf8');
  const actual = Buffer.from(hashEmailCode(submitted), 'utf8');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = { hashEmailCode, generateEmailCode, codeExpiry, emailCodeValid, CODE_TTL_MS };
