const test = require('node:test');
const assert = require('node:assert/strict');
const {handleAction} = require('../src/collab.cjs');
const {handleMediaAction} = require('../src/media.cjs');
const {verifyPassword} = require('../src/password.cjs');
const {emailCodeValid, hashEmailCode} = require('../src/email-code.cjs');

const user = {id:'member',username:'member'};
const imageKey = 'projects/project/image/saved.png';
const signer = {
  host:'bucket.example',
  signUpload: ({objectKey}) => ({url:'https://bucket.example/'+objectKey}),
  signDownload: ({objectKey}) => ({url:'https://bucket.example/'+objectKey+'?signed'}),
};
function fixture(project = {}, role = 'collaborator') {
  const writes = [];
  const row = {id:'project',owner_id:'owner',genre:'[COLLAB_PROJECT]',...project};
  return {
    writes,
    getProject: async () => row,
    findMembership: async () => ({role}),
    isProjectLocked: async () => false,
    createMedia: async (...args) => (writes.push(args), null),
    recordAssetImage: async (...args) => (writes.push(args), null),
    getStatsBundle: async () => (writes.push('stats'), {}),
    listMessages: async () => [{id:1,image_url:'https://bucket.example/'+imageKey}],
  };
}

test('media signing and registration respect project lifecycle', async () => {
  for (const project of [{genre:'[PROJECT_LOCKED]'}, {deleted_at:'2026-11-22'}]) {
    const repo = fixture(project);
    const payload = {projectId:'project',kind:'image',objectKey:imageKey};
    for (const action of ['media-upload-url','media-commit','media-record']) {
      assert.equal((await handleMediaAction(action,payload,user,repo,signer)).status,project.deleted_at ? 410 : 423);
    }
    assert.deepEqual(repo.writes,[]);
  }
});

test('asset registration and statistics enforce their respective roles', async () => {
  const repo = fixture();
  assert.equal((await handleAction('asset-image-record',{projectId:'project',assetId:'asset',objectKey:imageKey},user,repo,signer)).status,403);
  assert.equal((await handleAction('stats-get',{projectId:'project'},user,repo,signer)).status,403);
  assert.deepEqual(repo.writes,[]);
});

test('private chat image URLs are freshly signed for project members', async () => {
  const reply = await handleAction('messages-list',{projectId:'project'},user,fixture(),signer);
  assert.equal(reply.body[0].image_url,'https://bucket.example/'+imageKey+'?signed');
});

test('malformed stored expiry or password hash fails authentication cleanly', () => {
  assert.equal(verifyPassword('password','salt:wrong'),false);
  assert.equal(emailCodeValid({expires_at:'invalid',code_hash:hashEmailCode('12345678')},'12345678'),false);
});
