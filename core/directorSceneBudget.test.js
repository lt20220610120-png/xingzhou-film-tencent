import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneSourceTape } from './directorSegmentation.js';
import { parseDirectorDialogues } from './directorDialogue.js';
import { buildEditorialSceneFacts, createSceneDurationBudget, planEditorialScene, validateEditorialPlan, estimateSpokenPerformance } from './directorSceneBudget.js';
import { manorScene, englishManorScene } from './directorSceneBudget.fixtures.js';

test('real bilingual manor example: 32-second limit produces two clips with every source character retained', () => {
  const tape = buildSceneSourceTape(manorScene), facts = buildEditorialSceneFacts(tape);
  const plan = planEditorialScene({ tape, maxDurationSeconds: 32, facts });
  assert.equal(facts.translationPairs.length, 6, JSON.stringify(facts.performances));
  assert.equal(plan.segments.length, 2, JSON.stringify(plan.editorialBudget));
  assert.equal(plan.segments.map(s => tape.sourceText.slice(s.sourceStart, s.sourceEnd)).join(''), tape.sourceText);
  assert.equal(validateEditorialPlan(plan, tape, 32), true);
  const cut = plan.segments[0].sourceEnd;
  assert.ok(cut > tape.sourceText.indexOf('properly looked after.'), JSON.stringify(plan));
  assert.ok(cut < tape.sourceText.indexOf('Sebastian Paik：'), JSON.stringify(plan));
});

test('English-only scene has essentially the same duration and count; surnames and V.O. preserved', () => {
  const tape = buildSceneSourceTape(englishManorScene), facts = buildEditorialSceneFacts(tape);
  assert.ok(parseDirectorDialogues(tape.sourceText).some(row => row.speaker === 'Family Doctor'));
  assert.ok(parseDirectorDialogues(tape.sourceText).some(row => row.speaker === 'Sebastian Paik' && row.mode === '场外声音'));
  const bilingual = buildEditorialSceneFacts(buildSceneSourceTape(manorScene));
  assert.ok(Math.abs(facts.referenceSeconds - bilingual.referenceSeconds) < 1);
  assert.equal(planEditorialScene({ tape, maxDurationSeconds: 32 }).segments.length, 2);
  assert.ok(estimateSpokenPerformance("Before he fell into a coma, the chairman asked her to stay.").seconds < 6);
});

test('fixed scene budget: 50 seconds uses 2 clips; 70 uses 3 regardless of proposed extra cuts', () => {
  const tape = buildSceneSourceTape(Array.from({length:10}, (_,i) => `${i%2?'乙':'甲'}：这是一段完整的对白，表达同一场戏接下来的事情。`).join('\n'));
  for (const [total, count] of [[50,2],[70,3]]) {
    const plan = planEditorialScene({ tape, maxDurationSeconds: 30, assessment: { estimatedSceneSeconds: total, cuts: tape.units.map(u=>({unitId:u.id})) } });
    assert.equal(plan.editorialBudget.totalEstimatedSeconds, total);
    assert.equal(plan.segments.length, count);
    assert.ok(plan.segments.every(s => s.recommendedDurationSeconds <= 30));
  }
});

test('32/33 second single performance may compact into 30; 35/38 seconds require two', () => {
  for (const [total, count] of [[32,1],[33,1],[35,2],[38,2]]) {
    assert.equal(createSceneDurationBudget({ facts:{referenceSeconds:total,speechSeconds:total,explicitActionSeconds:0},maxDurationSeconds:30,assessment:{estimatedSceneSeconds:total} }).targetCount, count);
  }
});

test('same actor consecutive speeches stay together when another natural cut is available', () => {
  const source = `甲：${'这一段话需要完整地说完。'.repeat(3)}\n甲：${'然后我还要接着把这件事情说明白。'.repeat(2)}\n△乙抬起头。\n乙：${'我理解了你的意思。'.repeat(6)}`;
  const tape = buildSceneSourceTape(source), plan=planEditorialScene({tape,maxDurationSeconds:32,assessment:{estimatedSceneSeconds:50}});
  assert.equal(plan.segments.length, 2);
  assert.ok(plan.segments[0].sourceEnd >= source.indexOf('△乙'));
});

test('unrelated bilingual speakers are not silently considered a translation pair', () => {
  const facts=buildEditorialSceneFacts(buildSceneSourceTape('甲：请进。\nBob: Thank you for inviting me.'));
  assert.equal(facts.translationPairs.length,0);
  assert.equal(facts.performances.length,2);
  const repeated=buildEditorialSceneFacts(buildSceneSourceTape('甲：请把钥匙还给我，我现在要离开这里。\nBob: No. You are staying here until the police arrive.\n甲：我已经说过这不是我做的，你凭什么把我关在这里？\nBob: Because I saw you take the money with my own eyes.'));
  assert.equal(repeated.translationPairs.length,0);assert.equal(repeated.performances.length,4);
});

test('bad estimates/oversegmentation/capacity refusal never reject valid source; tiny cap is advisory', () => {
  const tape=buildSceneSourceTape(englishManorScene);
  for (const assessment of [{capacityIssue:{message:'4字每秒拒绝'}},{estimatedSceneSeconds:999999},{estimatedSceneSeconds:-1},{segments:Array(6).fill({})}]) {
    const plan=planEditorialScene({tape,maxDurationSeconds:32,assessment});
    assert.equal(plan.segments.length,2);
    assert.equal(validateEditorialPlan(plan,tape,32),true);
  }
  const long=buildSceneSourceTape('Alice Cooper: This is one complete sentence with no natural cut.');
  const plan=planEditorialScene({tape:long,maxDurationSeconds:1});
  assert.equal(validateEditorialPlan(plan,long,1),true);
  assert.ok(plan.planningWarnings.length);
});
