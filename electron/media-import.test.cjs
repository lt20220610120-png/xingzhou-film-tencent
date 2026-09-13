const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { importMediaFiles } = require('./media-import.cjs');

test('batch native picker imports every selection in order with unique paths and original names', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-media-import-'));
  try {
    for (const folder of ['one', 'two']) { fs.mkdirSync(path.join(root, folder)); fs.writeFileSync(path.join(root, folder, '角色.png'), folder); }
    const files = ['one', 'two'].map(folder => path.join(root, folder, '角色.png'));
    let options;
    const imported = await importMediaFiles({kind:'image',multiple:true,destDir:path.join(root,'media'),dialog:{showOpenDialog:async value => { options=value; return {filePaths:files}; }}});
    assert.ok(options.properties.includes('multiSelections'));
    assert.equal(imported.length,2);
    assert.notEqual(imported[0].filePath,imported[1].filePath);
    assert.deepEqual(imported.map(item=>fs.readFileSync(item.filePath,'utf8')),['one','two']);
    assert.deepEqual(imported.map(item=>item.name),['角色.png','角色.png']);
    const single=await importMediaFiles({kind:'image',destDir:path.join(root,'media'),dialog:{showOpenDialog:async options=>{assert.deepEqual(options.properties,['openFile']);return {filePaths:files};}}});
    assert.equal(single.length,1);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('audio multi-select and cancellation preserve the expected dialog contract',async()=>{
  let options;
  const result=await importMediaFiles({kind:'audio',multiple:true,destDir:'unused',dialog:{showOpenDialog:async value=>{options=value;return {canceled:true,filePaths:[]};}}});
  assert.deepEqual(result,[]);assert.match(options.title,/音频/);assert.ok(options.filters[0].extensions.includes('wav'));assert.ok(options.properties.includes('multiSelections'));
});
