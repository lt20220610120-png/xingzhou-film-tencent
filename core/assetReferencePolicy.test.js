import test from 'node:test';
import assert from 'node:assert/strict';
import { bindingProblems, bindingSnapshot, compileEntryBinding, entryBindingSignature, proposeEntryBinding } from './promptArtBinding.js';
import { fixture } from './promptDistribution.fixtures.js';

test('asset preference suppresses only image readiness and keeps the existing association and latent seat', () => {
  const {project, ledger} = fixture();
  const card = bindingSnapshot(project, ledger, []).cards[0];
  const asset = {id:'asset-a', name:card.name, category:card.category, adoptedImageId:null, images:[]};
  const before = bindingSnapshot(project, ledger, [asset]);
  const source = {...before.entries[0], prompt:`【基础设定】\n人物：${card.name}\n【分镜】\n继续移动`};
  before.cards[0].publishedSceneIds = [source.sceneId];
  const decision = {...proposeEntryBinding(before, source), confirmed:true};
  assert.match(bindingProblems(before, source, decision, {requireImages:true}).join(' '), /尚未选定有效图片/);
  const after = bindingSnapshot(project, ledger, [{...asset, noReferenceImage:true}], before);
  const entry = source;
  after.cards[0].publishedSceneIds = [entry.sceneId];
  assert.equal(entryBindingSignature(after, entry), decision.signature);
  assert.deepEqual(bindingProblems(after, entry, decision, {requireImages:true}), []);
  assert.equal(compileEntryBinding(after, entry, decision).references.length, 0);
  const slots = compileEntryBinding(after, entry, decision, {preview:true,storyboardSlots:true});
  assert.equal(slots.references[0].assetId, asset.id);
  assert.equal(slots.references[0].assetImageSlot, true);
  assert.deepEqual(slots.pendingMedia, []);
  after.cards[0].publishedSceneIds = [];
  const current = {...decision, signature:entryBindingSignature(after, entry)};
  assert.match(bindingProblems(after, entry, current, {requireImages:true}).join(' '), /尚未核实发布/);
});
