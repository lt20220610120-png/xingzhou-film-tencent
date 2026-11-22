const crypto = require('node:crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
  return `${salt}:${digest}`;
}

function verifyPassword(password, stored) {
  const match = /^([a-f0-9]{32}):([a-f0-9]{64})$/.exec(stored || '');
  if (!match) return false;
  const [,salt,expected] = match;
  const actual = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

module.exports = { hashPassword, verifyPassword };
