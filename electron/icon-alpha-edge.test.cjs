const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

test('图标半透明边缘使用邻近图标颜色预乘，不得残留黑色 RGB 暗边', () => {
  const root = path.join(__dirname, '..');
  const png = PNG.sync.read(fs.readFileSync(path.join(root, 'build/icon-master.png')));
  let semi = 0;
  let darkSemi = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2], a = png.data[i + 3];
    if (a > 0 && a < 255) {
      semi += 1;
      if (Math.max(r, g, b) < 80) darkSemi += 1;
    }
  }
  assert.ok(semi > 0, '圆角边缘应有抗锯齿半透明像素');
  assert.ok(darkSemi / semi < 0.02, `半透明暗色边缘比例过高：${darkSemi}/${semi}`);
});
