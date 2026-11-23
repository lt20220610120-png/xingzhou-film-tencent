const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {handleAction} = require('../src/collab.cjs');
const {snapshotRevision,validateSnapshot} = require('../src/local-project-share.cjs');

test('cloud asset preference accepts a deduplicated card selection from art roles only', async () => {
  const projectId = randomUUID(), assetId = randomUUID(), owner = randomUUID(), artist = randomUUID(), collaborator = randomUUID();
  const project = {id:projectId, owner_id:owner, genre:''};
  const writes = [];
  const repo = {
    getProjectAccess: (pid, user) => pid === projectId ? {...project, viewer_role:user===artist?'artist':'collaborator'} : null,
    isProjectLocked: () => false,
    setAssetReferenceImagePreference: (pid, preference, user) => {
      writes.push({pid, ...preference, user});
      return {updatedIds:preference.assetIds, skippedIds:[]};
    },
  };
  const payload = {projectId, assetIds:[assetId, assetId.toUpperCase()], noReferenceImage:true};
  const call = (user, updates) => handleAction('asset-reference-image-preference', {...payload,...updates}, {id:user}, repo);
  assert.equal((await call(collaborator)).status, 403);
  assert.equal((await call(owner,{assetIds:['invalid']})).status, 400);
  assert.equal((await call(owner,{projectId:randomUUID()})).status, 403);
  assert.equal((await call(artist)).status, 200);
  assert.deepEqual(writes,[{pid:projectId,assetIds:[assetId],noReferenceImage:true,user:artist}]);
  project.genre = '[PROJECT_LOCKED]';
  assert.equal((await call(owner)).status, 423);
});

test('share snapshots carry explicit preference without changing existing default snapshot revisions', () => {
  const id = randomUUID(), assetId = randomUUID();
  const project = {id,name:'兼容项目',episodes:[]};
  const asset = {id:assetId,category:'prop',name:'手提箱',episodes:[]};
  const validate = flags => validateSnapshot({project, assets:[{...asset,...flags}], media:[]},id).assets[0];
  assert.equal(Object.hasOwn(validate({}),'noReferenceImage'), false);
  assert.equal(validate({noReferenceImage:true}).noReferenceImage,true);
  assert.equal(validate({noReferenceImage:false}).noReferenceImage,false);
  assert.equal(snapshotRevision(project,[asset],[],[]),snapshotRevision(project,[{...asset,no_reference_image:false}],[],[]));
  assert.notEqual(snapshotRevision(project,[asset],[],[]),snapshotRevision(project,[{...asset,no_reference_image:true}],[],[]));
});
