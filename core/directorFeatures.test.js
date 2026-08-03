import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDirectorScenes, splitFullScript } from './scriptImport.js';

test('导演剧本识别全角冒号场景标题并拆开2-1和2-2', () => {
  const text = `祖宗！\n△陆宵拉着云锦瑟就往外跑。\n\n2-2：晒谷场 日 外\n人物：云锦瑟、陆宵\n△陆宵拉着云锦瑟走到晒谷场。`;
  const scenes = parseDirectorScenes(text, 2);
  assert.deepEqual(scenes.map(scene => scene.label), ['2-1', '2-2']);
  assert.doesNotMatch(scenes[0].content, /晒谷场/);
  assert.match(scenes[1].content, /2-2：晒谷场/);
});

test('第2集开头的年代信息并入首个真实场景，不生成重复的伪1-1', () => {
  const text = `【1935年】\n\n2-1：戏神庙 日 内\n人物：云锦瑟、陆宵\n△陆宵缓缓睁开眼。\n\n2-2：晒谷场 日 外\n人物：云锦瑟\n△众人走到晒谷场。`;
  const scenes = parseDirectorScenes(text, 2);
  assert.deepEqual(scenes.map(scene => scene.label), ['2-1', '2-2']);
  assert.match(scenes[0].content, /【1935年】[\s\S]*2-1：戏神庙/);
  assert.match(scenes[0].content, /陆宵缓缓睁开眼/);
});

test('各集场景强制使用当前集数并从1开始连续编号', () => {
  const text = `1-1：旧编号场景 日 内\n第一段正文\n\n1-2：旧编号场景 夜 外\n第二段正文`;
  assert.deepEqual(parseDirectorScenes(text, 2).map(scene => scene.label), ['2-1', '2-2']);
  assert.match(parseDirectorScenes(text, 2)[0].content, /^2-1：旧编号场景/m);
  assert.match(parseDirectorScenes(text, 2)[1].content, /^2-2：旧编号场景/m);
  assert.deepEqual(parseDirectorScenes(text, 3).map(scene => scene.label), ['3-1', '3-2']);
  assert.deepEqual(parseDirectorScenes(text, 4).map(scene => scene.label), ['4-1', '4-2']);
});

test('完整剧本分集返回结构化结果并保留总剧本', () => {
  const text = `第1集\n1-1：梨园 日 内\n正文一\n第2集\n2-1：戏神庙 日 内\n正文二`;
  const parsed = splitFullScript(text);
  assert.equal(parsed.detected, true);
  assert.equal(parsed.masterScript, text);
  assert.deepEqual(parsed.episodes.map(ep => ep.title), ['第1集', '第2集']);
  assert.match(parsed.episodes[1].content, /正文二/);
});

