const test = require('node:test');
const assert = require('node:assert/strict');

test('IP and fruit hubs each render one selectable entry while director upload remains direct', async () => {
  const { createServer } = await import('vite');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { ProjectCardHub } = await server.ssrLoadModule('/src/v06/ProjectCardHub.jsx');
    const render = props => renderToStaticMarkup(React.createElement(ProjectCardHub, { title: '项目', projects: [], onCreate() {}, ...props }));
    const ip = render({ kind: 'ip', onUpload() {}, onUploadCompleted() {} });
    assert.equal((ip.match(/class="[^"]*creator-entry-card/g) || []).length, 1);
    assert.match(ip, /<select[^>]*aria-label="IP 项目创建方式"/);
    assert.match(ip, /<option value="upload" selected="">上传小说<\/option>/);
    assert.match(ip, /<option value="completed">导入完成剧本<\/option>/);
    assert.match(ip, /<option value="create">新建项目<\/option>/);
    const fruit = render({ kind: 'fruit', onUpload() {} });
    assert.equal((fruit.match(/class="[^"]*creator-entry-card/g) || []).length, 1);
    assert.match(fruit, /<select[^>]*aria-label="果子项目创建方式"/);
    assert.match(fruit, /<option value="upload" selected="">上传剧本<\/option>/);
    const director = render({ onUpload() {}, library: [], groups: [{ id: 'director-workbench', name: '工作台', fixed: true }] });
    assert.doesNotMatch(director, /creator-entry-card|项目创建方式/);
    assert.match(director, /上传剧本/);
  } finally { await server.close(); }
});

test('IP scene editor renders clean headings while preserving literal dialogue hashes', async () => {
  const { createServer } = await import('vite');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { IPSceneEditor } = await server.ssrLoadModule('/src/creator/IPSceneEditor.jsx');
    const markup = renderToStaticMarkup(React.createElement(IPSceneEditor, { content: '### 场景1-1 外景 街道 日\r\n女主：#话题 C#。', readOnly: true }));
    assert.doesNotMatch(markup, /### 场景/);
    assert.match(markup, /女主：#话题 C#。/);
  } finally { await server.close(); }
});
