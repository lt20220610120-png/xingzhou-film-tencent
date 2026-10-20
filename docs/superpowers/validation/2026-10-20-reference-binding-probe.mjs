// Read-only production-code probe. Uses synthetic records and isolated fixture files.
// Run from tencent/: node docs/superpowers/validation/2026-10-20-reference-binding-probe.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { matchBasicReferences } from '../../../core/automaticReferences.js';

const require = createRequire(import.meta.url);
const { exportImagesToFolder } = require('../../../electron/image-export.cjs');
const { importEpisodeMedia } = require('../../../electron/episode-media-import.cjs');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const outputRoot = path.join(root, 'output', 'reference-binding-research-20261020');
await fs.mkdir(outputRoot, { recursive: true });
const fixtureRoot = await fs.mkdtemp(path.join(outputRoot, 'probe-'));
const image = (id, name, category) => ({ id, name, kind: 'image', ...(category ? { category } : {}) });
const prompt = (people, props = '无') => `【基础设定】\n人物：${people}\n道具：${props}\n【分镜】\n按本条动作执行。`;
const people = ['张三', '李四', '王五', '赵六', '钱七'];
const cases = [
  ['untyped-owner-prefix', prompt('张三', '杯子'), [image('person', '001-【张三】.png'), image('cup', '002-【张三-杯子】.png')], false],
  ['typed-owner-prefix', prompt('张三', '杯子'), [image('person', '张三', 'character'), image('cup', '张三-杯子', 'prop')], false],
  ['untyped-owned-name-no-separator', prompt('张三', '杯子'), [image('person', '张三'), image('cup', '张三的杯子')], false],
  ['noun-first-two-owners', prompt('张三', '杯子'), [image('person', '张三'), image('cup-a', '杯子-张三'), image('cup-b', '杯子-李四')], false],
  ['five-people-enumeration', prompt(people.join('、')), people.map((n, i) => image('p' + i, n)), false],
  ['five-people-comma', prompt(people.join('，')), people.map((n, i) => image('p' + i, n)), false],
  ['five-people-semicolon', prompt(people.join('；')), people.map((n, i) => image('p' + i, n)), false],
  ['two-wardrobes', prompt('张三，穿白衣。'), [image('white', '张三-白衣', 'character'), image('black', '张三-黑衣', 'character')], false],
  ['extra-scene-attachments', prompt('张三'), [image('person', '张三', 'character'), image('other', '李四', 'character'), image('cup', '杯子', 'prop')], true],
  ['stale-wrong-alias', prompt('张三（参考@image2）', '杯子'), [image('person', '张三', 'character'), image('cup', '杯子', 'prop')], true],
];
const results = cases.map(([id, text, refs, attached]) => {
  const result = matchBasicReferences({ prompt: text, references: attached ? refs : [] }, refs);
  return { id, input: text, candidates: refs, selected: result.references.map(r => r.id), prompt: result.prompt };
});
assert.match(results[0].prompt, /张三（参考@image1 @image2）/);
assert.deepEqual(results[1].selected, ['person']);
assert.deepEqual(results[2].selected, ['person']);
assert.deepEqual(results[3].selected, ['person', 'cup-a', 'cup-b']);
assert.deepEqual(results[4].selected, []);
assert.deepEqual(results[5].selected, ['p0']);
assert.equal(results[6].selected.length, 5);
assert.deepEqual(results[7].selected, ['white', 'black']);
assert.deepEqual(results[8].selected, ['person', 'other', 'cup']);
assert.match(results[9].prompt, /张三（参考@image2 @image1）/);

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxioAAAAASUVORK5CYII=', 'base64');
const exportRoot = path.join(fixtureRoot, 'export');
await exportImagesToFolder({
  images: [{ id: 'image-cup', assetId: 'asset-cup', projectId: 'project-demo', category: 'prop',
    assetName: '【张三-杯子】', episodes: [1], sceneIds: ['1-1'], filename: 'cup.png' }],
  dir: exportRoot, layout: 'scene', fetchImage: async () => png,
});
const imported = await importEpisodeMedia({
  dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [exportRoot] }) },
  destDir: path.join(fixtureRoot, 'import'), mode: 'series',
});
const refs = imported.scenes['1-1'];
assert.equal(refs.length, 1);
assert.equal(refs[0].category, undefined);
assert.equal(refs[0].assetId, undefined);
assert.equal(refs[0].imageId, undefined);
const rebound = matchBasicReferences({ prompt: prompt('张三', '杯子'), references: refs }, refs);
assert.match(rebound.prompt, /张三（参考@image1）/);
const report = {
  baseline: 'xingzhou-film-tencent 2.8.53 / 125778d',
  scope: 'Synthetic functional probes; no model calls, no real user assets, no production changes.',
  meaning: 'Assertions confirm CURRENT observed behavior, not that the defects are fixed.',
  cases: results,
  roundTrip: { importedReference: refs[0], prompt: rebound.prompt },
};
const reportPath = path.join(fixtureRoot, 'report.json');
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ cases: results.length, roundTrip: 'confirmed', reportPath }));
