import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProjectGroupName, normalizeProjectGroupName } from './projectGroups.js';

test('新建分组提供连续的默认名称', () => {
  assert.equal(defaultProjectGroupName([]), '分组 1');
  assert.equal(defaultProjectGroupName([{ name: '分组 1' }, { name: '其他' }]), '分组 2');
});

test('分组名去除首尾空格且不能为空', () => {
  assert.equal(normalizeProjectGroupName('  灵异题材  '), '灵异题材');
  assert.throws(() => normalizeProjectGroupName('   '), /分组名称不能为空/);
});
