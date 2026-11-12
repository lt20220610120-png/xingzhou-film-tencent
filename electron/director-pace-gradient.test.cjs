const test = require('node:test');
const assert = require('node:assert/strict');

test('short-drama pace gradient calibrates inflated 34-39s scenes down to realistic durations and shrinks monotonically from normal(100) -> balanced(50) -> compact(0)', async () => {
  const { buildSceneSourceTape } = await import('../core/directorSegmentation.js');
  const { buildEditorialSceneFacts, createSceneDurationBudget, planEditorialScene } = await import('../core/directorSceneBudget.js');
  const { resolveDirectorPaceProfile } = await import('../core/directorDurationPolicy.js');

  assert.equal(resolveDirectorPaceProfile(0).tierLabel, '紧凑');
  assert.equal(resolveDirectorPaceProfile(50).tierLabel, '适中');
  assert.equal(resolveDirectorPaceProfile(100).tierLabel, '正常');

  // Real short-drama scene structure matching user feedback (previously estimated at 34s+):
  const scene1 = `1-1 老旧居民楼·走廊 夜 内
昏黄的声控灯下，时江晚难以置信地看着林秋雨。
时江晚：你真的能听到我的心声？
林秋雨点头。
时江晚盯着她，嘴唇紧闭。
时江晚（内心OS）：怎么可能？她要是真能听到，我心里那些秘密不就全被她知道了？
林秋雨：你说，你心里的秘密要全被我知道了。
时江晚瞪大眼睛，连忙捂住嘴。
时江晚（内心OS）：不对，我又没说话，捂嘴有什么用！
林秋雨：你又没说话，捂嘴有什么用？
时江晚猛地放下手，惊得后退一步。
时江晚：你……你真的能听见？！
林秋雨抓住她的胳膊，激动得直点头。
画面定格。
林秋雨（画外音）：没错，我突然能听见我闺蜜的心声了。
林秋雨（画外音）：事情还要从一个小时前说起……
画面闪回。`;

  const tape = buildSceneSourceTape(scene1);
  const f100 = buildEditorialSceneFacts(tape, { pace: 100 });
  const f50 = buildEditorialSceneFacts(tape, { pace: 50 });
  const f0 = buildEditorialSceneFacts(tape, { pace: 0 });

  // Normal(100) is already calibrated below 30s (no longer inflated to 34~39s), and shrinks smoothly leftwards
  assert.ok(f100.referenceSeconds <= 30 && f100.referenceSeconds >= 24, `expected ~27s at normal(100), got ${f100.referenceSeconds}`);
  assert.ok(f50.referenceSeconds < f100.referenceSeconds, `expected balanced < normal`);
  assert.ok(f0.referenceSeconds < f50.referenceSeconds && f0.referenceSeconds >= 18, `expected compact < balanced, got ${f0.referenceSeconds}`);

  // Unmarked transition cues ("画面闪回。") must NOT be swallowed into speech
  assert.ok(!f100.performances.some(p => p.speech.includes('画面闪回')));

  // Long static visual prose ("地毯上洇开...照片上是一个穿着普通的年轻男人") takes < 1s, not 2-4s
  const proseOnly = buildSceneSourceTape('1-2 楼下 日 外\n林秋雨拿着手机，照片上是一个穿着普通的年轻男人。\n屏幕上显示：父亲。\n甲：走吧。');
  const proseFacts = buildEditorialSceneFacts(proseOnly, { pace: 50 });
  assert.equal(proseFacts.performances.length, 1);
  assert.equal(proseFacts.performances[0].speaker, '甲');
  assert.ok(proseFacts.referenceSeconds < 3.5, `visual prose should be instant glance, got ${proseFacts.referenceSeconds}`);

  // Live strictModelCap prevents LLM from inflating a 27s scene back to 38s
  const capped = createSceneDurationBudget({
    facts: f50,
    maxDurationSeconds: 30,
    pace: 50,
    strictModelCap: true,
    assessment: { estimatedSceneSeconds: 39, timingRationale: '模型偏慢估算' },
  });
  assert.ok(capped.totalEstimatedSeconds <= 30, `strictModelCap should clamp inflated 39s down to <=30s, got ${capped.totalEstimatedSeconds}`);
  assert.equal(capped.targetCount, 1);

  // A 64s dialogue scene under 30s cap: 3 segments at normal(100) if >66s, fewer/shorter at compact(0)
  const mediumScene = buildSceneSourceTape(
    Array.from({ length: 12 }, (_, i) => `${i % 2 ? '林秋雨' : '时江晚'}：这件事情没你想的那么简单，我们现在必须马上赶过去处理清楚！`).join('\n')
  );
  const pNormal = planEditorialScene({ tape: mediumScene, maxDurationSeconds: 25, pace: 100 });
  const pCompact = planEditorialScene({ tape: mediumScene, maxDurationSeconds: 25, pace: 0 });
  assert.ok(pCompact.editorialBudget.totalEstimatedSeconds < pNormal.editorialBudget.totalEstimatedSeconds);
  assert.ok(pCompact.segments.length <= pNormal.segments.length);
});

test('DirectorQuickControls and DirectorQuickProgress render pace rail and live duration readout cleanly', async () => {
  const { createServer } = await import('vite');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { DirectorQuickControls, DirectorQuickProgress } = await server.ssrLoadModule('/src/v06/DirectorQuickControls.jsx');

    const controlsAuto = renderToStaticMarkup(
      React.createElement(DirectorQuickControls, {
        settings: { segmentationMode: 'auto', maxDurationSeconds: 30, pace: 0 },
        onSettingsChange: () => {},
      })
    );
    assert.match(controlsAuto, /aria-label="短剧节奏梯度"/);
    assert.match(controlsAuto, /紧凑/);
    assert.match(controlsAuto, /正常/);

    const controlsManual = renderToStaticMarkup(
      React.createElement(DirectorQuickControls, {
        settings: { segmentationMode: 'manual', maxDurationSeconds: 30, pace: 100 },
        onSettingsChange: () => {},
      })
    );
    assert.doesNotMatch(controlsManual, /aria-label="短剧节奏梯度"/);

    const sampleScene = '1-1 走廊 夜 内\n时江晚：你真的能听到我的心声？\n林秋雨：你说，你心里的秘密要全被我知道了。';
    const progressHtml = renderToStaticMarkup(
      React.createElement(DirectorQuickProgress, {
        run: null,
        sceneText: sampleScene,
        maxDurationSeconds: 30,
        pace: 50,
        sourceView: 'source',
        onSourceViewChange: () => {},
        stale: false,
        error: '',
      })
    );
    assert.match(progressHtml, /整场预计/);
    assert.match(progressHtml, /适中节奏/);
  } finally {
    await server.close();
  }
});
