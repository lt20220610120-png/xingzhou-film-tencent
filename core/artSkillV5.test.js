import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ART_RUNTIME_SKILL,
  COLLAB_ART_SKILL,
  COLLAB_ART_SKILL_NAME,
  COLLAB_ART_SKILL_VERSION,
  buildCollabAnalysisMessages,
  buildEpisodeAnalysisMessages,
  buildEpisodeBatchAnalysisMessages,
} from './collabArtSkill.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = path.join(repoRoot, 'core', 'artAssetSkillV5.json');
const builtinRoot = path.join(repoRoot, 'core', 'builtin-skills', 'art-asset-list-v5');
const desktopRoot = path.join(process.env.USERPROFILE || '', 'Desktop', 'art-asset-list-v5');
const readBundle = () => JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
const normalize = value => String(value).replace(/\r\n/g, '\n');
const allText = bundle => Object.values(bundle.files).join('\n\n');

const expectedFiles = [
  'SKILL.md',
  'references/character-assets.md',
  'references/continuity-and-incremental.md',
  'references/extraction-and-audit.md',
  'references/image-generation.md',
  'references/naming-and-output.md',
  'references/prop-assets.md',
  'references/research-boundaries.md',
  'references/scene-assets.md',
];

test('v5 bundle matches the complete portable source and an available desktop delivery', () => {
  assert.ok(fs.existsSync(bundlePath), 'missing core/artAssetSkillV5.json');
  const bundle = readBundle();
  assert.equal(bundle.version, 5);
  assert.equal(bundle.revision, '5.0.0');
  assert.deepEqual(Object.keys(bundle.files).sort(), expectedFiles);
  for (const name of expectedFiles) {
    const source = path.join(builtinRoot, ...name.split('/'));
    assert.ok(fs.existsSync(source), `missing bundled source ${name}`);
    assert.equal(normalize(bundle.files[name]), normalize(fs.readFileSync(source, 'utf8')), `${name} differs from bundle`);
    if (fs.existsSync(desktopRoot)) {
      const delivered = path.join(desktopRoot, ...name.split('/'));
      assert.ok(fs.existsSync(delivered), `missing desktop source ${name}`);
      assert.equal(normalize(bundle.files[name]), normalize(fs.readFileSync(delivered, 'utf8')), `${name} differs from desktop delivery`);
    }
  }
  const root = bundle.files['SKILL.md'];
  assert.match(root, /^---\nname: art-asset-list-v5\n/);
  assert.match(root, /\n  version: 5\.0\.0\n/);
});

test('v5 has one non-contradictory asset contract for people, costumes, scenes, audit, and incremental runs', () => {
  const text = allText(readBundle());
  assert.match(text, /人物资产只收录[^\n]*实际出镜/);
  assert.match(text, /仅声音[^\n]*手机[^\n]*仅提及[^\n]*审计/);
  assert.match(text, /拟人非人角色[^\n]*实际可见/);
  assert.match(text, /第二套及以后[^\n]*参考【[^】]+】[^\n]*只写[^\n]*差异/);
  assert.match(text, /不得重复[^\n]*脸型[^\n]*五官[^\n]*身材[^\n]*肤质/);
  assert.match(text, /轻微[^\n]*(受伤|污损)[^\n]*不[^\n]*独立/);
  assert.match(text, /不因[^\n]*(换场|场次)[^\n]*换装/);
  assert.match(text, /场景[^\n]*只[^\n]*场次头/);
  assert.match(text, /同一地点[^\n]*时间[^\n]*参考【[^】]+】[^\n]*只改变[^\n]*光线/);
  assert.match(text, /真实不同[^\n]*(房间|内外)[^\n]*不[^\n]*合并/);
  assert.match(text, /增量[^\n]*指定新增一集/);
  assert.match(text, /不得[^\n]*覆盖[^\n]*全剧/);
  assert.match(text, /历史[^\n]*首次集数[^\n]*(不得|不允许)[^\n]*(改|篡改)/);
  assert.match(text, /审计[^\n]*三大总览[^\n]*之后/);
  assert.doesNotMatch(text, /700[–-]1100|450[–-]700|每个新人物及新换装.*完整面容|新换装资产必须完整重复固定脸部/);
});

test('v5 preserves the exact software hierarchy and the downstream image prefix boundary', () => {
  const text = allText(readBundle());
  assert.match(text, /### 第N集[\s\S]*人物：[\s\S]*场景：[\s\S]*道具：[\s\S]*- 【资产名】/);
  assert.match(text, /无（本集未识别到该类资产）/);
  assert.match(text, /服装层次[^\n]*描述字段[^\n]*不得解析为新资产/);
  assert.ok(text.includes('白色背景，4格统一排版，左侧1格为胸像大头特写，右侧3格为全身照三视图，所有画面中的主体完全一致，面部特征完全统一、发型完全同一、服装、完全统一，身材比例完全统一。'));
  assert.match(text, /生图前置[^\n]*(不属于|不是)[^\n]*文本分析输出/);
});

test('all V5 analysis entrypoints send the same complete bundled skill', () => {
  const bundle = readBundle();
  assert.equal(COLLAB_ART_SKILL_NAME, '剧本美术清单 v5（内置）');
  assert.equal(COLLAB_ART_SKILL_VERSION, bundle.version);
  assert.equal(ART_RUNTIME_SKILL, COLLAB_ART_SKILL);
  for (const content of Object.values(bundle.files)) assert.ok(COLLAB_ART_SKILL.includes(content));

  const full = buildCollabAnalysisMessages({ genre: '都市', script: '完整剧本' });
  const one = buildEpisodeAnalysisMessages({
    genre: '都市', episodeNumber: 8, title: '新增集', content: '8-1 医院 病房 日 内',
    previousSummaries: ['### 第1集\n人物：\n- 【甲-基准造型】历史锚点'],
  });
  const batch = buildEpisodeBatchAnalysisMessages({
    style: 'AI真人', genre: '都市',
    episodes: [{ episodeNumber: 8, title: '新增集', content: '8-1 医院 病房 日 内' }],
    previousSummaries: ['既有资产账本'],
  });
  for (const messages of [full, one, batch]) {
    const payload = messages.map(message => message.content).join('\n');
    assert.ok(payload.includes(COLLAB_ART_SKILL));
  }
  assert.match(one[0].content, /既有[^\n]*(摘要|锚点|账本)[^\n]*只用于[^\n]*(检索|复用|差异)/);
  assert.match(one[0].content, /当前输出[^\n]*只[^\n]*第8集/);
  assert.match(one.at(-1).content, /### 第8集/);
  assert.match(one.at(-1).content, /8-1 医院 病房 日 内/);
});
