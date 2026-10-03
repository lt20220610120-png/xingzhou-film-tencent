import test from 'node:test';
import assert from 'node:assert/strict';
import { promptsForScene } from './directorCreative.js';

test('提示词列表严格按当前集当前场景隔离，旧数据也不会串到其他集', () => {
  const mixed = [
    { label: '1-1-1', sceneLabel: '1-1', content: '第一集第一场' },
    { label: '1-2-1', sceneLabel: '1-2', content: '第一集第二场' },
    { label: '2-1-1', sceneLabel: '2-1', content: '第二集第一场' },
    { label: '1-1-2', content: '旧数据第一集第一场' },
  ];
  assert.deepEqual(promptsForScene(mixed, '2-1').map(item => item.label), ['2-1-1']);
  assert.deepEqual(promptsForScene(mixed, '1-1').map(item => item.label), ['1-1-1', '1-1-2']);
  assert.deepEqual(promptsForScene(mixed, '2-2'), []);
});
test('restored automatic clips display in numeric order within their batch without mixing manual or other runs',()=>{
 const auto=(id,label,run)=>({id,label,segmentationMode:'auto',generationRunId:run});
 const items=[auto('a2','43-3-2','a'),{id:'manual',label:'43-3-1'},auto('b1','43-3-1','b'),auto('a10','43-3-10','a'),auto('a1','43-3-1','a'),auto('b2','43-3-2','b')];
 assert.deepEqual(promptsForScene(items,'43-3').map(p=>p.id),['a1','a2','a10','manual','b1','b2']);
 assert.deepEqual(items.map(p=>p.id),['a2','manual','b1','a10','a1','b2']);
});
