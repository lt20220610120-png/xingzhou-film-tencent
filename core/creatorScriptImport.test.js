import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMasterScript,splitFullScript,replaceMasterSetting} from './scriptImport.js';
import {buildCreatorText,normalizeCreatorProject} from './creatorWorkspace.js';
test('creator archived episode headings import as separate director episodes',()=>{
 const p=normalizeCreatorProject({id:'p',mode:'original',episodes:[{id:'a',title:'第1集',result:'1-1 客厅 日 内\n人物：甲\n△出门。'},{id:'b',title:'第2集',result:'2-1 公园 夜 外\n人物：甲\n△归来。'}]},'script');
 const text=buildCreatorText(p,'script','output');
 const parsed=parseMasterScript(text).episodes.filter(e=>e.kind==='episode');
 assert.equal(parsed.length,2);assert.equal(parsed[0].title,'第1集');assert.match(parsed[1].content,/2-1 公园/);
 assert.equal(splitFullScript(text).episodes.length,2);
 assert.match(replaceMasterSetting(text,'新设定'),/【第1集】/);
});
test('explicit creator boundaries take priority over episode-like narrative or duplicate internal titles',()=>{
 const text='【第1集】\n第1集\n1-1 场景\n第一集里人物相遇了\n\n【第2集】\n第二集收录后修改';
 assert.equal(parseMasterScript(text).episodes.filter(e=>e.kind==='episode').length,2);
 assert.equal(splitFullScript(text).episodes.length,2);
 assert.match(parseMasterScript(text).episodes.at(-1).content,/第二集收录后修改/);
});
