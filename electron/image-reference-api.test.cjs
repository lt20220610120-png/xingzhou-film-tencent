const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generateImage } = require('./media-service.cjs');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=', 'base64');

async function fixture(t, inspect) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-image-ref-'));
  const calls = [];
  const server = http.createServer(async (req, res) => {
    try {
      calls.push(req.url);
      if (req.url === '/ref.png') {
        assert.equal(req.headers.authorization, undefined);
        res.writeHead(200, { 'content-type':'application/octet-stream' }); res.end(png); return;
      }
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const request = new Request(`http://localhost${req.url}`, { method: req.method, headers:req.headers, body:Buffer.concat(chunks) });
      const status = await inspect(req, request) || 200;
      res.writeHead(status, { 'content-type':'application/json' });
      res.end(JSON.stringify(status === 200 ? {data:[{b64_json:png.toString('base64')}]} : {error:{message:'edits not supported'}}));
    } catch (error) { res.writeHead(500); res.end(JSON.stringify({error:{message:error.message}})); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(dir,{recursive:true,force:true}); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {dir, base, calls, input:{endpoint:`${base}/v1/images/generations`, apiKey:'test-key', model:'gpt-image-2.5', prompt:'保留面容，替换服装', size:'1280x720', destDir:dir}};
}

test('custom image API receives the selected remote reference as multipart bytes with the selected model', async t => {
  const f = await fixture(t, async (req, request) => {
    assert.equal(req.url,'/v1/images/edits');
    assert.equal(req.headers.authorization,'Bearer test-key');
    assert.match(req.headers['content-type'],/multipart\/form-data; boundary=/);
    const form = await request.formData();
    assert.equal(form.get('model'),'gpt-image-2.5');
    assert.equal(form.get('size'),'1280x720');
    assert.equal(form.get('response_format'),null);
    assert.equal(form.get('image').type,'image/png');
    assert.deepEqual(Buffer.from(await form.get('image').arrayBuffer()),png);
  });
  const output = await generateImage({...f.input,references:[{kind:'image',url:`${f.base}/ref.png`}]});
  assert.deepEqual(fs.readFileSync(output),png);
  assert.deepEqual(f.calls,['/ref.png','/v1/images/edits']);
});

test('multiple local/data references preserve order and explicit edits endpoints are normalized', async t => {
  const f = await fixture(t, async (req, request) => {
    assert.equal(req.url,'/v1/images/edits');
    const form = await request.formData();
    const images = form.getAll('image[]');
    assert.equal(images.length,2);
    assert.deepEqual(await Promise.all(images.map(async image => Buffer.from(await image.arrayBuffer()))),[png,png]);
  });
  const local = path.join(f.dir,'input.png');fs.writeFileSync(local,png);
  await generateImage({...f.input,endpoint:`${f.base}/v1/images/edits`,references:[{kind:'image',filePath:local},{kind:'image',url:`data:image/png;base64,${png.toString('base64')}`}]});
});

test('generation without a reference keeps the existing JSON request', async t => {
  const f = await fixture(t, async (req, request) => {
    assert.equal(req.url,'/v1/images/generations');
    const body = await request.json();assert.equal(body.model,'gpt-image-2.5');assert.equal(body.response_format,'url');
  });
  await generateImage(f.input);
  assert.equal(f.calls.length,1);
});

test('unsupported edits fail once without a paid text-only fallback that drops the reference', async t => {
  const f = await fixture(t, () => 400);
  await assert.rejects(generateImage({...f.input,references:[{url:`data:image/png;base64,${png.toString('base64')}`}]}),/参考图生成失败.*edits not supported/);
  assert.deepEqual(f.calls,['/v1/images/edits']);
});
