import test from 'node:test';
import assert from 'node:assert/strict';
import { countIPDisplayCharacters,ipEditorCharacterStats } from './ipTextStats.js';

test('displayed script counts exclude heading markers, retain literal hashes, and include whitespace',()=>{
 assert.equal(countIPDisplayCharacters('## 甲\r\n### 乙\r\n #话题 😀'),10);
 assert.equal(countIPDisplayCharacters('## 甲\r\n',{script:false}),5);
 assert.equal(countIPDisplayCharacters(''),0);
});

test('whole manuscript and selected scene counts derive from the same displayed version',()=>{
 const current='## 第1集\n### 场景1-1 外景\n甲。\n### 场景1-2 内景\n乙。';
 const scene='### 场景1-2 内景\n乙。';
 assert.deepEqual(ipEditorCharacterStats(current,scene),{total:current.replace(/^(?:##|###) /gm,'').length,scene:'场景1-2 内景\n乙。'.length});
 assert.deepEqual(ipEditorCharacterStats('## 人物\n甲😀'),{total:5,scene:null});
 assert.equal(ipEditorCharacterStats('## 历史版本\n旧稿').total,7);
});
