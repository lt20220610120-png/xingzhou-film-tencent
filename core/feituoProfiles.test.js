import test from 'node:test';
import assert from 'node:assert/strict';
import models from './feituo-models.json' with { type: 'json' };
import {
  activeMediaProfile, FEITUO_ENDPOINT, generationMediaProfiles,
  isFeituoEndpoint, saveFeituoApiKey,
} from './canvasStore.js';

test('saving one Feituo key enables both media types, with all catalog models using the same credentials', () => {
  const state = saveFeituoApiKey({}, ' test-shared-key ');
  assert.equal(state.mediaProfiles.length, 2);
  for (const model of models) {
    const profile = activeMediaProfile(state, model.kind);
    assert.equal(profile.apiKey, 'test-shared-key');
    assert.equal(profile.endpoint, FEITUO_ENDPOINT);
    assert.ok(profile.id);
  }
  assert.equal(state.activeVideoApiId, activeMediaProfile(state, 'video').id);
  assert.equal(state.activeImageApiId, activeMediaProfile(state, 'image').id);
});

test('updating a shared key preserves old profile IDs, models, and unrelated provider settings', () => {
  const external = { id: 'external', kind: 'image', endpoint: 'https://example.test/v1', apiKey: 'external-test-key', model: 'custom' };
  const original = {
    activeVideoApiId: 'old-video', activeImageApiId: 'external',
    mediaProfiles: [external,
      { id: 'old-video', kind: 'video', endpoint: `${FEITUO_ENDPOINT}/api/open/v1/video/generate`, apiKey: 'old-test-key', model: models.find((m) => m.kind === 'video').id },
      { id: 'second-video', kind: 'video', endpoint: FEITUO_ENDPOINT, apiKey: 'stale-test-key', model: 'legacy-model' },
      { id: 'missing-endpoint', kind: 'image' }],
  };
  const saved = saveFeituoApiKey(original, 'replacement-test-key');
  const again = saveFeituoApiKey(saved, 'replacement-test-key');
  assert.equal(again.mediaProfiles.length, 5);
  assert.equal(again.activeVideoApiId, 'old-video');
  assert.deepEqual(again.mediaProfiles.find((p) => p.id === external.id), external);
  assert.equal(again.mediaProfiles.find((p) => p.id === 'second-video').model, 'legacy-model');
  assert.ok(again.mediaProfiles.filter((p) => isFeituoEndpoint(p.endpoint)).every((p) => p.apiKey === 'replacement-test-key'));
  assert.equal(original.mediaProfiles[1].apiKey, 'old-test-key');
});

test('legacy video-only key is reusable for images without requiring another save or losing pending-job identity', () => {
  const state = { activeVideoApiId: 'old-video', mediaProfiles: [{ id: 'old-video', kind: 'video', endpoint: FEITUO_ENDPOINT, apiKey: 'legacy-test-key', model: 'legacy-video' }] };
  const images = generationMediaProfiles(state, 'image');
  assert.equal(images.length, 1);
  assert.equal(images[0].kind, 'image');
  assert.equal(images[0].id, 'old-video');
  assert.equal(images[0].apiKey, 'legacy-test-key');
  assert.ok(models.some((m) => m.kind === 'image' && m.id === images[0].model));
  assert.equal(activeMediaProfile(state, 'image').id, 'old-video');
  assert.equal(state.mediaProfiles.length, 1);
});

test('legacy empty image key uses the saved Feituo video key while keeping the image profile ID', () => {
  const state = { activeVideoApiId: 'video', activeImageApiId: 'image', mediaProfiles: [
    { id: 'video', kind: 'video', endpoint: FEITUO_ENDPOINT, apiKey: 'saved-test-key' },
    { id: 'image', kind: 'image', endpoint: FEITUO_ENDPOINT, apiKey: '' },
  ] };
  assert.equal(activeMediaProfile(state, 'image').id, 'image');
  assert.equal(activeMediaProfile(state, 'image').apiKey, 'saved-test-key');
});

test('incomplete legacy endpoints and lookalike domains do not receive the shared key', () => {
  for (const endpoint of [undefined, '', 'https://feituokuajing.com.example.test', 'https://example.test/feituokuajing.com', 'https://feituokuajing.com@example.test', 'http://feituokuajing.com']) {
    assert.equal(isFeituoEndpoint(endpoint), false);
  }
  assert.equal(isFeituoEndpoint(` ${FEITUO_ENDPOINT}/api/open/v1 `), true);
  assert.deepEqual(generationMediaProfiles({ mediaProfiles: [{ id: 'incomplete', kind: 'image' }] }, 'image'), [{ id: 'incomplete', kind: 'image' }]);
  assert.throws(() => saveFeituoApiKey({}, '   '), /请填写飞拓 API Key/);
});
