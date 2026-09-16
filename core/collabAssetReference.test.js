import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssetReference } from './collabStore.js';
import { autoReferences } from './generationReferences.js';

const assets = [
  { id: 'base', name: '【米雪-公园便装】', category: 'character', episodes: [1], images: [{ id: 'first', url: 'https://example.test/first.png' }, { id: 'newest', url: 'https://example.test/newest.png' }] },
  { id: 'second', name: '【米雪-出租屋便装】', category: 'character', episodes: [2], images: [] },
  { id: 'third', name: '【米雪-晚礼服】', category: 'character', episodes: [3], images: [{ id: 'third-image', url: 'https://example.test/third.png' }] },
  { id: 'other', name: '【崔小溪-便服】', category: 'character', images: [{ url: 'https://example.test/other.png' }] },
];

test('later outfits use the first character image from an earlier episode, never the newest image', () => {
  for (const asset of [assets[1], assets[2]]) {
    const reference = resolveAssetReference(asset, assets);
    assert.equal(reference.id, 'base');
    assert.equal(autoReferences(`@${reference.name}`, [reference])[0].id, 'first');
  }
  assert.equal(resolveAssetReference(assets[0], assets), null);
  assert.equal(resolveAssetReference(assets[3], assets), null);
});

test('explicit alternate reference and no-reference override the automatic anchor', () => {
  assert.equal(resolveAssetReference(assets[1], assets, 'third').id, 'third');
  assert.equal(resolveAssetReference(assets[1], assets, ''), null);
  assert.equal(resolveAssetReference(assets[1], assets, 'deleted'), null);
  assert.equal(resolveAssetReference(assets[1], assets, 'other'), null);
});

test('default reference becomes available after the first image arrives without affecting explicit opt-out', () => {
  const empty = assets.map(asset => ({ ...asset, images: [] }));
  assert.equal(resolveAssetReference(empty[1], empty), null);
  empty[0].images.push({ id: 'first', url: 'https://example.test/first.png' });
  assert.equal(resolveAssetReference(empty[1], empty).id, 'base');
  assert.equal(resolveAssetReference(empty[1], empty, ''), null);
});

test('scene and prop variants retain opt-in references', () => {
  const sceneAssets = assets.slice(0, 2).map(asset => ({ ...asset, category: 'scene' }));
  assert.equal(resolveAssetReference(sceneAssets[1], sceneAssets), null);
  assert.equal(resolveAssetReference(sceneAssets[1], sceneAssets, 'base').id, 'base');
});

test('same scene place and interior default to the earliest imaged time variant with manual override', () => {
  const sceneAssets = [
    { id: 'night', category: 'scene', name: '【韩川出租屋-深夜-内】', first_episode: 2, images: [{ id: 'night-image', url: 'night.png' }] },
    { id: 'living-room', category: 'scene', name: '【韩川出租屋客厅-清晨-内】', first_episode: 1, images: [{ id: 'room-image', url: 'room.png' }] },
    { id: 'outside', category: 'scene', name: '【韩川出租屋-清晨-外】', first_episode: 1, images: [{ id: 'outside-image', url: 'outside.png' }] },
    { id: 'dawn', category: 'scene', name: '【韩川出租屋-凌晨-内】', first_episode: 1, images: [{ id: 'dawn-image', url: 'dawn.png' }] },
    { id: 'morning', category: 'scene', name: '【韩川出租屋-清晨-内】', first_episode: 3, images: [] },
  ];

  assert.equal(resolveAssetReference(sceneAssets[4], sceneAssets).id, 'dawn');
  assert.equal(resolveAssetReference(sceneAssets[4], sceneAssets, 'night').id, 'night');
  assert.equal(resolveAssetReference(sceneAssets[4], sceneAssets, ''), null);
  assert.equal(resolveAssetReference(sceneAssets[4], sceneAssets, 'living-room'), null);
  assert.equal(resolveAssetReference(sceneAssets[4], sceneAssets, 'outside'), null);
  assert.equal(resolveAssetReference(sceneAssets[3], sceneAssets), null);
});

test('new scene baseline ids without time anchor later lighting cards', () => {
  const assets = [
    { id: 'base', category: 'scene', name: '【韩川出租屋-内】', first_episode: 1, images: [{ id: 'base-image', url: 'base.png' }] },
    { id: 'morning', category: 'scene', name: '【韩川出租屋-清晨-内】', first_episode: 2, images: [] },
    { id: 'room', category: 'scene', name: '【韩川出租屋-客厅-内】', first_episode: 1, images: [{ id: 'room-image', url: 'room.png' }] },
  ];

  assert.equal(resolveAssetReference(assets[1], assets).id, 'base');
  assert.equal(resolveAssetReference(assets[1], assets, 'room'), null);
});
