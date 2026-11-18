const path = require('node:path');
const os = require('node:os');

function resolvePlaywright() {
  if (process.env.XINGZHOU_PLAYWRIGHT_PATH) return require.resolve(process.env.XINGZHOU_PLAYWRIGHT_PATH);
  try {
    return require.resolve('playwright');
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    return require.resolve(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
  }
}
module.exports = require(resolvePlaywright());
