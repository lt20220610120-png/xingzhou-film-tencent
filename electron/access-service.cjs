const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  createAccount,
  authenticateAccount,
  unlockAdditionalRole,
  publicAccount,
} = require('../core/accessControl.cjs');

const INVITES = [
  { digest: 'e8292e3e32c0d4a156d6d2745fd765ff21314a235cc18d1de71005f16794e278', kind: 'role', role: 'creator' },
  { digest: '88b3a1e51490f96cde42925beac0a6115bdcc5efbcab3712a8a0d6fdee3bde96', kind: 'role', role: 'director' },
  { digest: 'baf7108e7daa712ecdb1af6778246b692a42f43d095b53e051b0955c39c13323', kind: 'full' },
  { digest: '1664a3967342dd32894f8ea0ca1d97fab3ec3b7b9c824bb5512e6ceb96dc0641', kind: 'unlock' },
];

const digestInvite = (value) => crypto.createHash('sha256').update(value).digest('hex');

function createAccessService(userDataDir) {
  const file = path.join(userDataDir, 'accounts.json');
  const readStore = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return { accounts: [], sessionAccountId: null }; }
  };
  const writeStore = (store) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(store, null, 2), 'utf8');
  };
  const session = () => {
    const store = readStore();
    return publicAccount(store.accounts.find((account) => account.id === store.sessionAccountId));
  };
  const register = (payload) => {
    const store = readStore();
    const username = String(payload.username || '').trim().toLowerCase();
    if (store.accounts.some((account) => account.username === username)) throw new Error('该账号已存在');
    const account = createAccount(payload, { invites: INVITES, digestInvite });
    store.accounts.push(account);
    store.sessionAccountId = account.id;
    writeStore(store);
    return publicAccount(account);
  };
  const login = ({ username, password }) => {
    const store = readStore();
    const account = store.accounts.find((candidate) => authenticateAccount(candidate, username, password));
    if (!account) throw new Error('账号或密码不正确');
    store.sessionAccountId = account.id;
    writeStore(store);
    return publicAccount(account);
  };
  const logout = () => {
    const store = readStore();
    store.sessionAccountId = null;
    writeStore(store);
    return true;
  };
  const unlock = ({ inviteCode }) => {
    const store = readStore();
    const index = store.accounts.findIndex((account) => account.id === store.sessionAccountId);
    if (index < 0) throw new Error('请先登录账号');
    store.accounts[index] = unlockAdditionalRole(store.accounts[index], { inviteCode }, { invites: INVITES, digestInvite });
    writeStore(store);
    return publicAccount(store.accounts[index]);
  };
  return { session, register, login, logout, unlock };
}

module.exports = { createAccessService };
