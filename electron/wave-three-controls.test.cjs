const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(target) : [target];
  });
}

test('renderer does not block Electron with browser alert or confirm', () => {
  const callers = filesIn(path.join(root, 'src')).filter(file => /\.[jt]sx?$/.test(file))
    .filter(file => /(?<![\w.])(?:window\.)?(?:alert|confirm)\s*\(/.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(callers.map(file => path.relative(root, file)), []);
});

test('main and independent canvas share styled, top-layer select pickers', () => {
  const styles = fs.readFileSync(path.join(root, 'canvas-app/workspace-controls.css'), 'utf8');
  assert.match(styles, /::picker\(select\)/);
  assert.match(styles, /appearance:\s*base-select/);
  assert.match(styles, /option:checked/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(fs.readFileSync(path.join(root, 'src/main.jsx'), 'utf8'), /workspace-controls\.css/);
  assert.match(fs.readFileSync(path.join(root, 'canvas-app/index.html'), 'utf8'), /workspace-controls\.css/);
});

test('renderer styles have no external network font imports', () => {
  const css = [...filesIn(path.join(root, 'src')), ...filesIn(path.join(root, 'canvas-app'))].filter(file => file.endsWith('.css'));
  assert.deepEqual(css.filter(file => /fonts\.(?:googleapis|gstatic)\.com/i.test(fs.readFileSync(file, 'utf8'))).map(file => path.relative(root, file)), []);
});

test('audio waits for async cache lookup and preserves the requested byte range', async () => {
  const {readProjectAudio} = require('./project-audio-read.cjs');
  const url = 'https://example.invalid/fixture.wav';
  const request = new Request('xzmedia://project-audio/fixture', {headers:{Range:'bytes=10-17'}});
  const local = async input => {
    assert.match(input.url, /fixture\.wav$/);
    assert.equal(input.headers.get('range'), 'bytes=10-17');
    return new Response('12345678', {status:206});
  };
  for (const hit of [false, true]) {
    const response = await readProjectAudio(request,url,'qa',{
      readScope:()=> 'qa',
      cache:{peek:async()=>hit?{filePath:'fixture.wav'}:null,read:async (_url,_scope,relay)=>relay()},
      relay:async()=>({filePath:'fixture.wav'}),
      local,
      fetchFn:async()=>assert.fail('local audio escaped to COS'),
    });
    assert.equal(response.status,206);
    assert.equal(await response.text(),'12345678');
  }
});
