import test from 'node:test';
import assert from 'node:assert/strict';
import { collabEpisodeNumber, episodeNumbersInText, inspectCollabEpisodes, listCollabEpisodes, nextCollabEpisodeNumber } from './collabEpisodes.js';

test('协作分集保留原始集号并兼容元数据、中文标题和场次号', () => {
  const episodes = [
    { kind: 'setting', title: '设定和小传', content: '世界观' },
    { episodeNumber: 20, title: '后续', content: '正文' },
    { number: 22, title: '另一集', content: '正文' },
    { episode: 23, title: '另一集', content: '正文' },
    { episode_number: 24, title: '另一集', content: '正文' },
    { title: '第三十集 风雪夜', content: '正文' },
    { title: '番外', content: '31-1 夜 外 城门' },
  ];

  assert.equal(collabEpisodeNumber(episodes[1], 1), 20);
  assert.deepEqual(listCollabEpisodes(episodes).map((item) => item.episodeNumber), [20, 22, 23, 24, 30, 31]);
  assert.equal(nextCollabEpisodeNumber(episodes), 32);
});

test('无可靠集号、证据冲突、重复集号都明确失败而不按数组下标猜测', () => {
  assert.throws(() => collabEpisodeNumber({ title: '续写', content: '无场次号正文' }), /无法确认集数/);
  assert.throws(() => collabEpisodeNumber({ episodeNumber: 20, title: '第21集', content: '20-1 家 日 内' }), /集数冲突/);
  assert.throws(() => collabEpisodeNumber({ episodeNumber: 20, number: 21, title: '续写', content: '正文' }), /集数冲突/);
  assert.throws(() => listCollabEpisodes([{ title: '第20集', content: '20-1' }, { episode_number: 20, title: '续写', content: '20-2' }]), /重复/);
  assert.match(inspectCollabEpisodes([{title:'遗留资料',content:'无编号'}]).error,/无法确认集数/);
});

test('文本检测覆盖 Arabic、中文、EP/Episode、plain 标题和场次，并发现混集', () => {
  assert.deepEqual(episodeNumbersInText('### 第20集\n正文\n第二十一集\nEP 22\nEpisode 23\n24-1 家 日 内'), [20, 21, 22, 23, 24]);
  assert.throws(() => collabEpisodeNumber({ episodeNumber: 20, title: '第20集兼第21集', content: '20-1 家 日 内\n第二十一集\n正文' }), /集数冲突/);
  assert.throws(() => collabEpisodeNumber({ episodeNumber: 20, title: '续写', content: '第20集兼第21集\n正文' }), /集数冲突/);
});
