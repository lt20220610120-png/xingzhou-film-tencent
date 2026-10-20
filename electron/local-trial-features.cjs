const fs = require('node:fs');
const path = require('node:path');

// A device preference, not an account permission. Business permissions and
// source checks remain in the prompt-art handlers. Never bundled into releases.
function readLocalTrialFeatures(userDataDir) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(userDataDir, 'local-trial-features.json'), 'utf8'));
    return value?.version === 1 && value?.promptArtBinding === true;
  } catch { return false; }
}
function retainPrivateTrial(userDataDir, pkg) {
  if (pkg?.xingzhouPrivateTrial !== true) return readLocalTrialFeatures(userDataDir);
  fs.mkdirSync(userDataDir, { recursive: true });
  const file = path.join(userDataDir, 'local-trial-features.json');
  if (!readLocalTrialFeatures(userDataDir)) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, promptArtBinding: true, enabledByVersion: pkg.version }, null, 2));
    fs.renameSync(tmp, file);
  }
  return true;
}
module.exports = { readLocalTrialFeatures, retainPrivateTrial };
