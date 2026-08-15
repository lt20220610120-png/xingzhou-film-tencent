const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('主进程按 taskId 保存 AbortController 并暴露停止通道', () => {
  const main = read('electron/main.cjs');
  const preload = read('electron/preload.cjs');
  assert.match(main, /activeAiRequests=new Map/);
  assert.match(main, /ipcMain\.handle\('cancel-ai-task'/);
  assert.match(main, /controller\.abort\(\)/);
  assert.match(preload, /cancelAiTask:payload=>ipcRenderer\.invoke\('cancel-ai-task',payload\)/);
});

test('项目协作分析任务保存在组件外，切换功能栏不会销毁', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /const collabAnalysisJobs = new Map\(\)/);
  assert.match(ui, /停止分析/);
  assert.match(ui, /cancelAiTask/);
});
