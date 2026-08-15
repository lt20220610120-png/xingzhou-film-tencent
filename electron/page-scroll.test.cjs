const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const compat = () => fs.readFileSync(path.join(root, 'src/v100-compat.css'), 'utf8');

test('主内容区必须可滚动，避免项目卡片超出一屏后被遮挡', () => {
  const css = compat();
  assert.match(css, /\.content\{height:100vh;overflow-y:auto/);
  assert.match(css, /\.app\{height:100vh\}/);
});

test('行舟AI对话页使用flex纵向布局，输入框固定底部不被挤出屏幕', () => {
  const css = compat();
  assert.match(css, /\.persistent-ai \.chat-main\{display:flex;flex-direction:column;height:100vh/);
  assert.match(css, /\.persistent-ai \.chat-messages\{flex:1 1 0;min-height:0;overflow-y:auto\}/);
  assert.match(css, /\.persistent-ai \.chat-compose\{flex-shrink:0\}/);
});

test('模态框超高时内部滚动而不是被裁切', () => {
  const css = compat();
  assert.match(css, /\.veil \.modal\{max-height:88vh;overflow-y:auto\}/);
  assert.match(css, /\.delete-confirm\{max-height:88vh;overflow-y:auto\}/);
});

test('注册页必须自带滚动容器（body 全局 overflow:hidden 下仍可看到全部表单）', () => {
  const css = fs.readFileSync(path.join(root, 'src/account-access.css'), 'utf8');
  assert.match(css, /\.auth-screen\{height:100vh;overflow-y:auto/);
});
