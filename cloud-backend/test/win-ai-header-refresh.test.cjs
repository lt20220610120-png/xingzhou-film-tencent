const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Only model the DOM boundary; selectors and layout are also checked in the
// real-browser fixture (win-ai/scripts/verify-header-refresh.cjs).
function fixture() {
  const buttons = [], styles = [], observers = [], tasks = [];
  let reloads = 0, brand;
  const createElement = tag => ({
    tagName: tag.toUpperCase(), attributes: {}, style: {}, listeners: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, listener) { this.listeners[key] = listener; },
    remove() { this.isConnected = false; buttons.splice(buttons.indexOf(this), 1); },
  });
  const document = {
    documentElement: {}, head: { append(el) { styles.push(el); } },
    createElement,
    querySelectorAll(selector) {
      if (selector.startsWith('header ')) return brand ? [brand] : [];
      return buttons.filter(el => el.isConnected);
    },
    getElementById(id) { return [...buttons, ...styles].find(el => el.id === id); },
  };
  const mount = () => {
    const parent = { insertBefore(button) { button.parentNode = parent; button.isConnected = true; if (!buttons.includes(button)) buttons.push(button); brand.nextSibling = button; } };
    brand = { textContent: 'Win AI', parentNode: parent, nextSibling: null, isConnected: true };
    return brand;
  };
  const context = {
    document, location: { pathname: '/dashboard/overview', search: '', href: 'https://winai.xingzhoufilm.cn/dashboard/overview', reload() { reloads++; } },
    history: { pushState() {}, replaceState() {} }, sessionStorage: { getItem() {} },
    URL, URLSearchParams, addEventListener() {}, queueMicrotask: fn => tasks.push(fn),
    MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} },
  };
  const source = fs.readFileSync(path.join(__dirname, '../../win-ai/public/account-routing.js'), 'utf8');
  const flush = () => { while (tasks.length) tasks.shift()(); };
  return { run() { vm.runInNewContext(source, context); flush(); }, mount, mutate() { observers.forEach(fn => fn([])); flush(); }, buttons, styles, context, reloads: () => reloads, unmount() { brand = null; } };
}

test('native header gets one accessible refresh beside its existing brand; reload preserves session', () => {
  const f = fixture(), brand = f.mount();
  f.run();
  assert.equal(f.buttons.length, 1);
  const button = f.buttons[0];
  assert.equal(button.parentNode, brand.parentNode);
  assert.equal(button.attributes['aria-label'], '刷新 Win AI');
  assert.equal(button.type, 'button');
  assert.equal(f.styles.length, 1);
  const storage = f.context.sessionStorage;
  button.listeners.click({ preventDefault() {}, stopPropagation() {} });
  assert.equal(f.reloads(), 1);
  assert.equal(f.context.sessionStorage, storage);
  assert.equal(f.context.location.pathname, '/dashboard/overview');
});

test('SPA delayed mount and header replacement restore refresh without duplicates', () => {
  const f = fixture();
  f.run();
  assert.equal(f.buttons.length, 0);
  f.mount(); f.mutate(); f.mutate();
  assert.equal(f.buttons.length, 1);
  const old = f.buttons[0];
  const brand = f.mount(); f.mutate();
  assert.equal(f.buttons.length, 1);
  assert.equal(f.buttons[0].parentNode, brand.parentNode);
  assert.equal(old.isConnected, false);
  assert.equal(f.styles.length, 1);
  f.unmount(); f.mutate();
  assert.equal(f.buttons.length, 0);
});
