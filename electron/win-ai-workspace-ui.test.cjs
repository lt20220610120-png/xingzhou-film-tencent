const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

test('Win AI shell has no duplicate brand/dock and failed native open offers a working reconnect', async () => {
  const filename = path.join(__dirname, '../src/v06/WinAIWorkspace.jsx');
  const { transformWithOxc } = await import('vite');
  const source = fs.readFileSync(filename, 'utf8').replace(/^import[^\n]*\n/gm, '').replace('export function WinAIWorkspace', 'function WinAIWorkspace');
  const code = (await transformWithOxc(source, filename, { jsx: { runtime: 'classic' } })).code;
  let index = 0;
  const state = [false, '网络暂时不可用', 0];
  const hooks = {
    React, useRef: () => ({ current: null }), useEffect() {},
    useState() { const slot = index++; return [state[slot], update => { state[slot] = typeof update === 'function' ? update(state[slot]) : update; }]; },
    RefreshCw: () => React.createElement('svg', { 'aria-hidden': true }),
  };
  const Workspace = new Function(...Object.keys(hooks), code + ';return WinAIWorkspace;')(...Object.values(hooks));
  const tree = Workspace({ account: { id: 'mock-user' } });
  const markup = renderToStaticMarkup(tree);
  assert.doesNotMatch(markup, /<aside|<img|win-ai-dock|刷新 Win AI/);
  assert.match(markup, /aria-label="Win AI 控制台"/);
  assert.match(markup, /role="alert"/);
  assert.match(markup, /网络暂时不可用/);
  assert.match(markup, /重新连接/);
  const walk = node => !React.isValidElement(node) ? [] : [node, ...React.Children.toArray(node.props.children).flatMap(walk)];
  const reconnect = walk(tree).find(node => node.type === 'button');
  assert.equal(reconnect.props.disabled, false);
  reconnect.props.onClick();
  assert.equal(state[2], 1);
  index = 0; state[0] = true; state[1] = '';
  const busy = renderToStaticMarkup(Workspace({ account: { id: 'mock-user' } }));
  assert.match(busy, /正在打开 Win AI/);
  assert.doesNotMatch(busy, /重新连接|<button/);
});
