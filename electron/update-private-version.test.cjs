const test=require('node:test'),assert=require('node:assert/strict');
const {newerVersion}=require('./update-trust.cjs');
test('public upgrade compares the numeric base of an installed private version',()=>{
 assert.equal(newerVersion('2.8.55','2.8.54-private.1'),true);
 assert.equal(newerVersion('2.8.54','2.8.54-private.1'),true);
 assert.equal(newerVersion('2.8.53','2.8.54-private.1'),false);
 assert.equal(newerVersion('2.8.55','2.8.55'),false);
 assert.equal(newerVersion('2.8.55','2.8.54'),true);
 assert.equal(newerVersion('2.8.55','broken'),false);
});
