// Launch with Electron. This replaces only the packaged smoke driver inside this QA process.
const fixture = require('./fixtures/packaged-credential-smoke.cjs');
require('electron').app.getVersion = () => require('../package.json').version;
const bootstrap = require.resolve('../electron/packaged-smoke.cjs');
require.cache[bootstrap] = {
  exports: app => fixture.configure(app, process.env.XINGZHOU_SMOKE_TEST_ROOT, process.env.XINGZHOU_SMOKE_CREDENTIAL_PHASE),
};
require('../electron/main.cjs');
