const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ui = () => fs.readFileSync(path.join(root, 'src/v06/GlobalTools.jsx'), 'utf8');
const css = () => fs.readFileSync(path.join(root, 'src/v100-compat.css'), 'utf8');

test('Skill 编辑表单提供上传文档替换入口', () => {
  const source = ui();
  assert.match(source, /handleUploadReplace/);
  assert.match(source, /importSkillDocument/);
  assert.match(source, /上传文档替换/);
});

test('上传文档后先询问确认，确认后才替换提示词内容', () => {
  const source = ui();
  // 上传后先存入 pendingDoc，而不是直接 setContent
  assert.match(source, /setPendingDoc\(result\)/);
  assert.doesNotMatch(source, /handleUploadReplace[\s\S]{0,400}setContent\(result/);
  // 确认弹层带取消与确认替换两个动作
  assert.match(source, /是否用它替换当前提示词内容/);
  assert.match(source, /确认替换/);
  assert.match(source, /confirmReplace/);
  // confirmReplace 才写入内容
  assert.match(source, /const confirmReplace[\s\S]{0,200}setContent\(pendingDoc\.content/);
});

test('上传替换控件拥有配套样式', () => {
  const styles = css();
  assert.match(styles, /\.skill-upload-replace/);
  assert.match(styles, /\.skill-replace-confirm/);
  assert.match(styles, /\.skill-content-label-row/);
});
