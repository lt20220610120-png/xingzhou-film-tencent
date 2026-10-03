import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDurationLimit, buildSceneSourceTape, validateScenePlan, renderNumberedScene } from './directorSegmentation.js';

const candidateSegment = (unitId, seconds, extra = {}) => ({
  end: { unitId }, timing: { speechSeconds: seconds, actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 },
  startState: { continuity: '继承原文起态' }, endState: { continuity: '本段原文终态' }, boundary: { type: 'speaker-change', evidence: '甲收句，乙接话' }, visualNotes: [], ...extra,
});

test('standalone imported comment delimiters are mapped formatting while quoted speech stays literal', () => {
  const source = '1-1 景：房间\r\n<!--\r\n甲：好。\r\n-->\r\n';
  const tape = buildSceneSourceTape(source);
  assert.equal(tape.sourceText, '甲：好。');
  assert.equal(tape.sourceSnapshot, source);
  assert.equal(tape.sourceMap.filter(row => row.kind === 'format-marker').length, 2);
  const literal = '甲：“\n-->\n”';
  assert.equal(buildSceneSourceTape(literal).sourceText, literal);
});

test('highest duration accepts automatic zero and explicit integers 1 through 35', () => {
  for (const value of [-1, 36, 1.5, NaN, Infinity, '30', null]) assert.throws(() => assertDurationLimit(value), /0.*35/);
  assert.equal(assertDurationLimit(0), 35);
  assert.equal(assertDurationLimit(1), 1);
  assert.equal(assertDurationLimit(30), 30);
  assert.equal(assertDurationLimit(35), 35);
});

test('source removes only standalone numeric controls and separately maps scene header', () => {
  const tape = buildSceneSourceTape('\uFEFF1-1 景：厨房 日 内\r\n(1)\r\n甲：今年（2026年）拿（2）个杯子。\r\n（2）\r\n乙：好。');
  assert.equal(tape.sceneHeader, '1-1 景：厨房 日 内');
  assert.equal(tape.sourceText, '甲：今年（2026年）拿（2）个杯子。\n乙：好。');
  assert.equal(tape.sourceSnapshot.startsWith('\uFEFF'), true);
  assert.equal(tape.sourceMap.filter(row => row.kind === 'marker').length, 2);
  assert.equal(tape.units.map(unit => unit.text).join(''), tape.sourceText);
  for (const heading of ['1—2 夜 厨房 内', '场景 1-2 厨房', '1-2景：厨房']) assert.equal(buildSceneSourceTape(`${heading}\n甲：好。`).sceneHeader, heading);
  assert.equal(buildSceneSourceTape('1-1-1\n甲：好。').sceneHeader, '');
});

test('controlled forty-second scene is thirty plus ten, exact coverage and numbered rendering', () => {
  const tape = buildSceneSourceTape('1-1 景：室内\n甲：先把门锁好。\n乙：已经锁好了。');
  const firstEnd = tape.units.find(unit => unit.text.includes('甲：')).id;
  const result = validateScenePlan({ segments: [candidateSegment(firstEnd, 30), candidateSegment(tape.units.at(-1).id, 10)] }, { tape, maxDurationSeconds: 30 });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.deepEqual(result.plan.segments.map(segment => segment.recommendedDurationSeconds), [30, 10]);
  assert.equal(result.plan.segments.map(segment => tape.sourceText.slice(segment.sourceStart, segment.sourceEnd)).join(''), tape.sourceText);
  assert.match(renderNumberedScene(result.plan, tape), /^1-1 景：室内\n\n（1）\n/);
  assert.match(renderNumberedScene(result.plan, tape), /（2）\n乙：已经锁好了。/);
});

test('rejects over-limit rather than clipping and underfilled nonfinal segments', () => {
  const tape = buildSceneSourceTape('甲：擦汗。\n乙：回答。');
  for (const [seconds, code] of [[30.01, 'DURATION_EXCEEDED'], [5, 'UNDERFILLED_SEGMENT']]) {
    const result = validateScenePlan({ segments: [candidateSegment(tape.units[0].id, seconds), candidateSegment(tape.units.at(-1).id, 5)] }, { tape, maxDurationSeconds: 30 });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some(issue => issue.code === code));
  }
  assert.equal(validateScenePlan({ segments: [candidateSegment(tape.units.at(-1).id, 5)] }, { tape, maxDurationSeconds: 30 }).ok, true);
});

test('punctuation alone cannot be a video segment',()=>{
  const tape=buildSceneSourceTape('甲：走！');
  const result=validateScenePlan({segments:[candidateSegment('u1',30,{end:{unitId:'u1',prefix:'甲：走'}}),candidateSegment('u1',2)]},{tape,maxDurationSeconds:30});
  assert.equal(result.ok,false);assert.ok(result.issues.some(i=>i.code==='EMPTY_SEGMENT'));
});

test('decimal timing sums do not manufacture an over-limit binary rounding error', () => {
  const tape = buildSceneSourceTape('甲：台词和动作并行。');
  const segment = candidateSegment(tape.units[0].id, 30, { timing: { speechSeconds: 26.4, actionSeconds: 6.4, overlapSeconds: 2.8, transitionSeconds: 0 } });
  const result = validateScenePlan({ segments: [segment] }, { tape, maxDurationSeconds: 30 });
  assert.equal(result.ok, true);
  assert.equal(result.plan.segments[0].estimatedSeconds, 30);
  segment.timing.transitionSeconds = 0.01;
  assert.ok(validateScenePlan({ segments: [segment] }, { tape, maxDurationSeconds: 30 }).issues.some(issue => issue.code === 'DURATION_EXCEEDED'));
});

test('rejects missing coverage, repeated/reversed anchor and invalid timing overlap', () => {
  const tape = buildSceneSourceTape('甲：先做。\n乙：再做。');
  const options = { tape, maxDurationSeconds: 30 };
  const incomplete = validateScenePlan({ segments: [candidateSegment(tape.units[0].id, 5)] }, options);
  assert.ok(incomplete.issues.some(issue => issue.code === 'UNCOVERED_SOURCE'));
  const repeated = validateScenePlan({ segments: [candidateSegment(tape.units[0].id, 30), candidateSegment(tape.units[0].id, 5)] }, options);
  assert.ok(repeated.issues.some(issue => issue.code === 'ANCHOR_ORDER'));
  const unknown = validateScenePlan({ segments: [candidateSegment('missing', 5)] }, options);
  assert.ok(unknown.issues.some(issue => issue.code === 'INVALID_ANCHOR'));
  const invalid = validateScenePlan({ segments: [candidateSegment(tape.units.at(-1).id, 5, { timing: { speechSeconds: 5, actionSeconds: 2, overlapSeconds: 3, transitionSeconds: 0 } })] }, options);
  assert.ok(invalid.issues.some(issue => issue.code === 'INVALID_TIMING'));
});

test('precise prefixes split long speech without repeating or losing source, invalid word boundaries rejected', () => {
  const firstSentence='我'.repeat(52)+'。';
  const tape = buildSceneSourceTape('甲：'+firstSentence+'我'.repeat(28)+'。');
  const unit = tape.units[0];
  const good = validateScenePlan({ segments: [candidateSegment(unit.id, 13, { end: { unitId: unit.id, prefix: '甲：'+firstSentence } }), candidateSegment(tape.units.at(-1).id, 7)] }, { tape, maxDurationSeconds: 15 });
  assert.equal(good.ok, true, JSON.stringify(good.issues));
  assert.equal(good.plan.segments.map(segment => tape.sourceText.slice(segment.sourceStart, segment.sourceEnd)).join(''), tape.sourceText);
  const wordTape = buildSceneSourceTape('甲：unbrokenword continues。');
  const bad = validateScenePlan({ segments: [candidateSegment(wordTape.units[0].id, 13, { end: { unitId: wordTape.units[0].id, prefix: '甲：unbro' } }), candidateSegment(wordTape.units.at(-1).id, 5)] }, { tape: wordTape, maxDurationSeconds: 15 });
  assert.ok(bad.issues.some(issue => issue.code === 'INVALID_BOUNDARY'));
});

test('cannot cut emoji or combining grapheme midway', () => {
  for (const value of ['甲：👨‍👩‍👧‍👦继续。', '甲：e\u0301继续。']) {
    const tape = buildSceneSourceTape(value);
    const prefix = value.slice(0, 3);
    const result = validateScenePlan({ segments: [candidateSegment(tape.units[0].id, 13, { end: { unitId: tape.units[0].id, prefix } }), candidateSegment(tape.units.at(-1).id, 5)] }, { tape, maxDurationSeconds: 15 });
    assert.ok(result.issues.some(issue => issue.code === 'INVALID_BOUNDARY'));
  }
});

test('JSON parsing rejects surrounding analysis, malformed JSON and missing segment state', () => {
  const tape = buildSceneSourceTape('动作完成。');
  const result = validateScenePlan('```json\n{"segments":[]}\n```', { tape, maxDurationSeconds: 30 });
  assert.equal(result.ok, false);
  const malformed = validateScenePlan('这里是分析 {"segments":[]}', { tape, maxDurationSeconds: 30 });
  assert.ok(malformed.issues.some(issue => issue.code === 'INVALID_JSON'));
  const missing = candidateSegment(tape.units.at(-1).id, 2);
  delete missing.endState;
  assert.ok(validateScenePlan({ segments: [missing] }, { tape, maxDurationSeconds: 30 }).issues.some(issue => issue.code === 'INVALID_SEGMENT_STATE'));
  assert.ok(validateScenePlan({ segments: [candidateSegment(tape.units.at(-1).id, 2, { startState: {}, endState: '' })] }, { tape, maxDurationSeconds: 30 }).issues.some(issue => issue.code === 'INVALID_SEGMENT_STATE'));
});

test('controlled 150 seconds yields ten 15-second pieces or five 30-second pieces', () => {
  const tape = buildSceneSourceTape(Array.from({ length: 10 }, (_, index) => `甲：第${index + 1}段原话。`).join('\n'));
  for (const limit of [15, 30]) {
    const units = limit === 15 ? tape.units : tape.units.filter((unit, index) => index % 2 === 1);
    const result = validateScenePlan({ segments: units.map(unit => candidateSegment(unit.id, limit)) }, { tape, maxDurationSeconds: limit });
    assert.equal(result.ok, true);
    assert.equal(result.plan.segments.length, 150 / limit);
    assert.equal(result.plan.segments.reduce((total, segment) => total + segment.estimatedSeconds, 0), 150);
    assert.equal(result.plan.segments.map(segment => tape.sourceText.slice(segment.sourceStart, segment.sourceEnd)).join(''), tape.sourceText);
  }
});

test('one-second impossible capacity is explicit without padding, deleting source or raising maximum', () => {
  const tape = buildSceneSourceTape('甲：不能把不可拆动作硬塞进去。');
  const result = validateScenePlan({ capacityIssue: { message: '当前内容无法在该上限下自然完成，需调整分段或上限。', sourceQuote: '不可拆动作' } }, { tape, maxDurationSeconds: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, 'CAPACITY_LIMIT');
  assert.match(result.issues[0].message, /无法/);
  assert.equal(tape.sourceText, '甲：不能把不可拆动作硬塞进去。');
});
