const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const mammoth = require('mammoth');
const JSZip = require(require.resolve('jszip', { paths: [path.dirname(require.resolve('mammoth'))] }));
const { buildCreatorDocument, creatorDocumentFileName, saveCreatorDocument, importCreatorVideo, loadCreatorStateWithBackup } = require('./creator-documents.cjs');

async function temporaryDirectory(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xz-creator-document-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('DOCX exports a valid ZIP with the required document content type and relationships', async () => {
  const bytes = buildCreatorDocument({ name: '剧本', content: '第一集', format: 'docx' });
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  assert.deepEqual(Object.keys(zip.files).sort(), ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
  const types = await zip.file('[Content_Types].xml').async('string');
  assert.match(types, /PartName="\/word\/document\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml"/);
  const relationships = await zip.file('_rels/.rels').async('string');
  assert.match(relationships, /Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/officeDocument" Target="word\/document\.xml"/);
  const extracted = await mammoth.extractRawText({ buffer: bytes });
  assert.equal(extracted.value, '第一集\n\n');
  assert.deepEqual(extracted.messages, []);
});

test('DOCX roundtrips Chinese, emoji and XML punctuation while removing invalid XML characters', async () => {
  const content = '中文🙂 <人物> & "对白" \'心声\'\u0000\u0001\u000b\u001f\ufffe\uffff\ud800尾';
  const bytes = buildCreatorDocument({ content, format: 'docx' });
  const extracted = await mammoth.extractRawText({ buffer: bytes });
  assert.equal(extracted.value, '中文🙂 <人物> & "对白" \'心声\'尾\n\n');
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /&lt;人物&gt; &amp; &quot;对白&quot; &apos;心声&apos;/);
  assert.doesNotMatch(xml, /[\u0000\u0001\u000b\u001f\ufffe\uffff]/);
});

test('DOCX preserves tabs, leading and trailing spaces, empty lines and mixed line endings', async () => {
  const bytes = buildCreatorDocument({ content: '第1集\r\n\t开场  \r\n\r人物\t动作\n', format: 'docx' });
  const extracted = await mammoth.extractRawText({ buffer: bytes });
  assert.equal(extracted.value, '第1集\n\n\t开场  \n\n\n\n人物\t动作\n\n\n\n');
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml').async('string');
  assert.equal((xml.match(/<w:p>/g) || []).length, 5);
  assert.equal((xml.match(/<w:tab\/>/g) || []).length, 2);
  assert.match(xml, /xml:space="preserve"/);
});

test('TXT exports UTF-8 with BOM and retains the original text and line endings', () => {
  const bytes = buildCreatorDocument({ content: '第1集\r\n\t动作🙂\n', format: 'txt' });
  assert.ok(Buffer.isBuffer(bytes));
  assert.equal(bytes.toString('utf8'), '\ufeff第1集\r\n\t动作🙂\n');
});

test('invalid document input rejects before showing a dialog without echoing its content', async () => {
  const invalid = [null, {}, { content: 'secret-fixture', format: 'pdf' }, { content: 42, format: 'txt' }, { content: ' \n\t', format: 'docx' }, { content: '\u0000\ud800', format: 'docx' }];
  let dialogs = 0;
  const dialog = { showSaveDialog: async () => { dialogs++; return { canceled: true }; } };
  for (const payload of invalid) {
    assert.throws(() => buildCreatorDocument(payload), error => error instanceof Error && !error.message.includes('secret-fixture'));
    await assert.rejects(saveCreatorDocument(payload, { dialog }), error => error instanceof Error && !error.message.includes('secret-fixture'));
  }
  assert.equal(dialogs, 0);
});

test('default export names cannot become Windows paths or reserved device names', () => {
  assert.equal(creatorDocumentFileName('第一集:茶/馆.docx', 'docx'), '第一集_茶_馆.docx');
  assert.equal(creatorDocumentFileName('CON', 'txt'), '_CON.txt');
  assert.equal(creatorDocumentFileName('lpt9.txt', 'docx'), '_lpt9.docx');
  assert.equal(creatorDocumentFileName(' .\u0000 ', 'txt'), '创作稿.txt');
  assert.equal(creatorDocumentFileName(undefined, 'txt'), '创作稿.txt');
  assert.equal(creatorDocumentFileName('标题.  ', 'docx'), '标题.docx');
  const longName = creatorDocumentFileName('🙂'.repeat(150), 'docx');
  assert.equal(Array.from(longName.replace(/\.docx$/, '')).length, 120);
  assert.doesNotMatch(longName, /\ufffd/);
});

test('canceling an export returns null and never creates the dialog destination', async t => {
  const dir = await temporaryDirectory(t);
  const filePath = path.join(dir, '取消.docx');
  const result = await saveCreatorDocument({ content: '不会保存', format: 'docx' }, { dialog: { showSaveDialog: async () => ({ canceled: true, filePath }) } });
  assert.equal(result, null);
  await assert.rejects(fs.access(filePath), { code: 'ENOENT' });
  assert.equal(await saveCreatorDocument({ content: '不会保存', format: 'txt' }, { dialog: { showSaveDialog: async () => ({ canceled: false }) } }), null);
});

test('selected TXT and DOCX destinations are written and the saved path is returned', async t => {
  const dir = await temporaryDirectory(t);
  for (const format of ['txt', 'docx']) {
    const filePath = path.join(dir, `成功.${format}`);
    let options;
    const result = await saveCreatorDocument({ name: '第1集/终稿', content: '中文正文🙂\n对白', format }, { dialog: { showSaveDialog: async value => { options = value; return { canceled: false, filePath }; } } });
    assert.equal(result, filePath);
    assert.equal(options.defaultPath, `第1集_终稿.${format}`);
    assert.deepEqual(options.filters[0].extensions, [format]);
    const bytes = await fs.readFile(filePath);
    if (format === 'txt') assert.equal(bytes.toString('utf8'), '\ufeff中文正文🙂\n对白');
    else assert.equal((await mammoth.extractRawText({ path: filePath })).value, '中文正文🙂\n\n对白\n\n');
  }
});

test('real filesystem write failures reject instead of being reported as cancellation', async t => {
  const dir = await temporaryDirectory(t);
  const filePath = path.join(dir, '不存在的目录', '剧本.docx');
  await assert.rejects(saveCreatorDocument({ content: '正文', format: 'docx' }, { dialog: { showSaveDialog: async () => ({ canceled: false, filePath }) } }), { code: 'ENOENT' });
});

test('video import returns only the selected source and does not pretend to transcribe it', async t => {
  const dir = await temporaryDirectory(t);
  const filePath = path.join(dir, '素材.MP4');
  await fs.writeFile(filePath, Buffer.from('video fixture'));
  let options;
  const source = await importCreatorVideo({ dialog: { showOpenDialog: async value => { options = value; return { canceled: false, filePaths: [filePath] }; } } });
  assert.deepEqual(source, { fileName: '素材.MP4', filePath });
  assert.deepEqual(options.properties, ['openFile']);
  assert.ok(options.filters[0].extensions.includes('mp4'));
  assert.equal(await importCreatorVideo({ dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [filePath] }) } }), null);
  assert.equal(await importCreatorVideo({ dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [] }) } }), null);
});

test('video import rejects files outside its advertised video formats', async () => {
  await assert.rejects(importCreatorVideo({ dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ['C:\\资料\\剧本.docx'] }) } }), /视频/);
});

async function desktopApi(dialog, { getPath = () => os.tmpdir() } = {}) {
  const handlers = new Map();
  let window;
  class TestWindow {
    constructor(){window=this;this.webContents={mainFrame:{url:''},on(){},setWindowOpenHandler(){}};}
    on(){} isDestroyed(){return false;}
    loadURL(url){this.webContents.mainFrame.url=url;return Promise.resolve();}
    loadFile(file){this.webContents.mainFrame.url=require('node:url').pathToFileURL(file).href;return Promise.resolve();}
  }
  const electron = {
    BrowserWindow:TestWindow,
    app: { isPackaged: false, setName() {}, setAppUserModelId() {}, getPath, commandLine: { appendSwitch() {} }, whenReady: () => new Promise(() => {}), on() {} },
    dialog,
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    protocol: { registerSchemesAsPrivileged() {} },
  };
  vm.runInNewContext((await fs.readFile(path.join(__dirname, 'main.cjs'), 'utf8'))+'\ncreateWindow();', {
    require: name => name === 'electron' ? electron : name === './packaged-smoke.cjs' ? () => false : require(name),
    __dirname, process: { on() {}, platform: process.platform }, Buffer, setTimeout, URL, Response, AbortController,
  }, { filename: 'main.cjs' });
  let api;
  vm.runInNewContext(await fs.readFile(path.join(__dirname, 'preload.cjs'), 'utf8'), {
    require: () => ({
      contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } },
      ipcRenderer: { invoke: async (channel, payload) => {
        if (!handlers.has(channel)) throw new Error(`Unregistered test IPC: ${channel}`);
        return handlers.get(channel)({sender:window.webContents,senderFrame:window.webContents.mainFrame}, payload);
      } },
    }),
  }, { filename: 'preload.cjs' });
  return api;
}

test('desktop document and video APIs use the actual handlers and preserve TXT and Word script import', async t => {
  const dir = await temporaryDirectory(t);
  let documentPath = path.join(dir, '剧本.docx');
  const videoPath = path.join(dir, '参考.mp4');
  const api = await desktopApi({
    showSaveDialog: async () => ({ canceled: false, filePath: documentPath }),
    showOpenDialog: async options => ({ canceled: false, filePaths: [options.title === '导入完整剧本' ? documentPath : videoPath] }),
  });
  assert.equal(await api.saveCreatorDocument({ name: '剧本', content: '第一集\n中文🙂', format: 'docx' }), documentPath);
  let imported = await api.importFullScript();
  assert.equal(imported.filePath, documentPath);
  assert.equal(imported.content, '第一集\n\n中文🙂\n\n');
  const video = await api.importCreatorVideo();
  assert.equal(video.filePath, videoPath);
  assert.equal(video.fileName, '参考.mp4');
  assert.equal(video.content, undefined);
  documentPath = path.join(dir, '剧本.txt');
  assert.equal(await api.saveCreatorDocument({ name: '剧本', content: '第二集\n对白', format: 'txt' }), documentPath);
  imported = await api.importFullScript();
  assert.equal(imported.content, '第二集\n对白');
  assert.equal(typeof api.saveTxt, 'function');
  assert.equal(typeof api.saveTxtBatch, 'function');
});

test('loading legacy fruit and script projects preserves their exact disk bytes before returning unchanged state', async t => {
  const dir = await temporaryDirectory(t);
  for (const kind of ['fruitProjects', 'scriptProjects']) {
    const folder = path.join(dir, kind);
    await fs.mkdir(folder);
    const filePath = path.join(folder, 'xingzhou-data.json');
    const original = Buffer.from(`\ufeff{\r\n  "${kind}": [{"id":"old","masterScript":"原总稿", "episodes":[{"rawText":"原文","scriptText":"改稿"}]}],\r\n  "directorProjects": [{"id":"director","prompts":["已保存"]}], "accountState": {"id":"fixture"}\r\n}\r\n`);
    await fs.writeFile(filePath, original);
    const loaded = await loadCreatorStateWithBackup(filePath);
    assert.deepEqual(loaded, JSON.parse(original.toString('utf8').replace(/^\ufeff/, '')));
    assert.deepEqual(await fs.readFile(filePath), original);
    assert.deepEqual(await fs.readFile(path.join(folder, 'state.pre-creator-v260.backup.json')), original);
    assert.equal(loaded[kind][0].creator, undefined);
  }
});

test('repeated and concurrent legacy loads never replace the first byte-for-byte backup', async t => {
  const dir = await temporaryDirectory(t);
  const filePath = path.join(dir, 'xingzhou-data.json');
  const original = Buffer.from('{ "scriptProjects": [{"id":"first","masterScript":"最初原稿"}] }\n');
  await fs.writeFile(filePath, original);
  const results = await Promise.all([loadCreatorStateWithBackup(filePath), loadCreatorStateWithBackup(filePath), loadCreatorStateWithBackup(filePath)]);
  assert.equal(results[0].scriptProjects[0].id, 'first');
  const later = { scriptProjects: [{ id: 'later', masterScript: '后续改稿' }] };
  await fs.writeFile(filePath, JSON.stringify(later));
  assert.deepEqual(await loadCreatorStateWithBackup(filePath), later);
  assert.deepEqual(await fs.readFile(path.join(dir, 'state.pre-creator-v260.backup.json')), original);
});

test('empty, missing and already migrated state does not create a migration backup', async t => {
  const dir = await temporaryDirectory(t);
  const filePath = path.join(dir, 'xingzhou-data.json');
  assert.equal(await loadCreatorStateWithBackup(filePath), null);
  const cases = [
    { fruitProjects: [], scriptProjects: [], directorProjects: [{ id: 'director' }] },
    { fruitProjects: [null], scriptProjects: [null] },
    { fruitProjects: [{ id: 'fruit', creator: { schemaVersion: 1 } }], scriptProjects: [{ id: 'script', creator: { schemaVersion: 1 } }] },
  ];
  for (const state of cases) {
    await fs.writeFile(filePath, JSON.stringify(state));
    assert.deepEqual(await loadCreatorStateWithBackup(filePath), state);
    await assert.rejects(fs.access(path.join(dir, 'state.pre-creator-v260.backup.json')), { code: 'ENOENT' });
  }
});

test('backup creation failure rejects without changing the source or accepting an invalid existing backup', async t => {
  const dir = await temporaryDirectory(t);
  const filePath = path.join(dir, 'xingzhou-data.json');
  const backupPath = path.join(dir, 'state.pre-creator-v260.backup.json');
  const original = Buffer.from('{"fruitProjects":[{"id":"legacy","masterScript":"保留原稿"}]}');
  await fs.writeFile(filePath, original);
  await fs.mkdir(backupPath);
  await assert.rejects(loadCreatorStateWithBackup(filePath), error => error.code === 'CREATOR_BACKUP_FAILED' && /备份/.test(error.message) && !error.message.includes('保留原稿'));
  assert.deepEqual(await fs.readFile(filePath), original);
  await fs.rmdir(backupPath);
  await fs.writeFile(backupPath, '{"partial":');
  await assert.rejects(loadCreatorStateWithBackup(filePath), { code: 'CREATOR_BACKUP_FAILED' });
  assert.equal(await fs.readFile(backupPath, 'utf8'), '{"partial":');
  assert.deepEqual(await fs.readFile(filePath), original);
});

test('desktop state save is blocked after failed backup until a successful reload', async t => {
  const dir = await temporaryDirectory(t);
  const dataDir = path.join(dir, '行舟影视资料');
  await fs.mkdir(dataDir);
  const filePath = path.join(dataDir, 'xingzhou-data.json');
  const backupPath = path.join(dataDir, 'state.pre-creator-v260.backup.json');
  const original = Buffer.from('{"scriptProjects":[{"id":"legacy","masterScript":"完整旧稿"}],"directorProjects":[{"id":"director"}]}\n');
  await fs.writeFile(filePath, original);
  await fs.mkdir(backupPath);
  const api = await desktopApi({}, { getPath: () => dir });
  await assert.rejects(api.loadState(), /备份/);
  const migrated = { scriptProjects: [{ id: 'legacy', creator: { schemaVersion: 1 } }], directorProjects: [{ id: 'director' }] };
  await assert.rejects(api.saveState(migrated), /备份/);
  assert.deepEqual(await fs.readFile(filePath), original);
  await fs.rmdir(backupPath);
  assert.equal((await api.loadState()).scriptProjects[0].masterScript, '完整旧稿');
  await api.saveState(migrated);
  assert.deepEqual(JSON.parse(await fs.readFile(filePath, 'utf8')), migrated);
  assert.deepEqual(await fs.readFile(backupPath), original);
});

test('desktop state save takes a migration backup even if it is invoked before state load', async t => {
  const dir = await temporaryDirectory(t);
  const dataDir = path.join(dir, '行舟影视资料');
  await fs.mkdir(dataDir);
  const filePath = path.join(dataDir, 'xingzhou-data.json');
  const original = Buffer.from('{ "fruitProjects": [{"id":"legacy","masterScript":"读取前原稿"}] }\r\n');
  await fs.writeFile(filePath, original);
  const api = await desktopApi({}, { getPath: () => dir });
  await api.saveState({ fruitProjects: [{ id: 'legacy', creator: { schemaVersion: 1 } }] });
  assert.deepEqual(await fs.readFile(path.join(dataDir, 'state.pre-creator-v260.backup.json')), original);
});

test('a damaged existing JSON state rejects loading while preserving every original byte', async t => {
  const dir = await temporaryDirectory(t);
  const filePath = path.join(dir, 'xingzhou-data.json');
  const original = Buffer.from('\ufeff{\r\n "fruitProjects": [{"masterScript":"尚未修复的原稿"}],\r\n');
  await fs.writeFile(filePath, original);
  await assert.rejects(loadCreatorStateWithBackup(filePath), error => error.code === 'CREATOR_STATE_LOAD_FAILED' && !error.message.includes('尚未修复的原稿'));
  assert.deepEqual(await fs.readFile(filePath), original);
  await assert.rejects(fs.access(path.join(dir, 'state.pre-creator-v260.backup.json')), { code: 'ENOENT' });
});

test('a damaged desktop state blocks default autosave and no backup replaces the main file', async t => {
  const dir = await temporaryDirectory(t);
  const dataDir = path.join(dir, '行舟影视资料');
  await fs.mkdir(dataDir);
  const filePath = path.join(dataDir, 'xingzhou-data.json');
  const backupPath = path.join(dataDir, 'state.pre-creator-v260.backup.json');
  const original = Buffer.from('{"scriptProjects":[{"id":"damaged","masterScript":"保留受损稿"}');
  const backup = Buffer.from('{"scriptProjects":[{"id":"backup","masterScript":"备份版本"}]}\n');
  await fs.writeFile(filePath, original);
  await fs.writeFile(backupPath, backup);
  const api = await desktopApi({}, { getPath: () => dir });
  await assert.rejects(api.loadState(), { code: 'CREATOR_STATE_LOAD_FAILED' });
  await assert.rejects(api.saveState({ fruitProjects: [], scriptProjects: [], directorProjects: [] }), { code: 'CREATOR_STATE_LOAD_FAILED' });
  assert.deepEqual(await fs.readFile(filePath), original);
  assert.deepEqual(await fs.readFile(backupPath), backup);
});
