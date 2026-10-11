import test from 'node:test';import assert from 'node:assert/strict';
import {protectPreferenceStorage} from './preferenceStorage.js';import {appendDirectorEpisode,prepareDirectorEpisodeAddition} from './directorAppendEpisode.js';import {parseMasterScript,parseDirectorScenes} from './scriptImport.js';
test('full UI preference storage keeps navigation usable but critical content save still reports failure',()=>{
 class Store{setItem(){throw new DOMException('full','QuotaExceededError')}getItem(){return null}removeItem(){}}
 const s=new Store(),other=new Store(),restore=protectPreferenceStorage(s,Store.prototype);try{s.setItem('xz-director-pane:user:p','episode');assert.equal(s.getItem('xz-director-pane:user:p'),'episode');s.removeItem('xz-director-pane:user:p');assert.equal(s.getItem('xz-director-pane:user:p'),null);assert.throws(()=>s.setItem('xz-director-manual-output:p','paid'),{name:'QuotaExceededError'});assert.throws(()=>other.setItem('xz-role','director'));}finally{restore();}
});
test('wrapped English and spaced headings survive reparse after append',()=>{
 for(const title of ['【Episode 1】','【EP1】','【 第1集 】']){
  const p={id:'p',masterScript:title+'\n1-1 原场景',episodes:[{id:'old',title,kind:'episode',content:'1-1 原场景'}]};
  const r=appendDirectorEpisode(p,'2-1 新场景');assert.equal(parseMasterScript(r.masterScript).episodes.filter(e=>e.kind==='episode').length,2);
 }
});
test('retry after failed save keeps existing IDs, edits and a single appended episode',()=>{
 const p={id:'p',masterScript:'第1集\n原文',episodes:[{id:'old',title:'第1集',kind:'episode',content:'原文'}]};
 const attempt=prepareDirectorEpisodeAddition(null,p,'新增内容',p.masterScript,'a');
 const applied={...p,...attempt.result};applied.episodes[1].prompts=[{content:'保存失败后继续创作'}];
 const retry=prepareDirectorEpisodeAddition(attempt,applied,'新增内容',applied.masterScript,'a');
 assert.equal(retry.applied,true);assert.equal(retry.result.episodes.length,2);assert.equal(retry.result.added[0].id,attempt.result.added[0].id);assert.equal(retry.result.episodes[1].prompts[0].content,'保存失败后继续创作');
 assert.equal(prepareDirectorEpisodeAddition(attempt,{...p,id:'other'},'新增内容',p.masterScript,'a').applied,false);
});
test('adding episodes preserves existing creative work and recognizes wrapped and spaced episode headings',()=>{
 for(const wrapped of [true,false]){const title=wrapped?'【第1集】':'第1集',old={id:'e',title:'第1集',content:'1-1 房 日 内',prompts:[{id:'paid',content:'成果'}],sceneVisions:{'1-1':'构想'}};const p={masterScript:title+'\n'+old.content,episodes:[{id:'s',kind:'setting',title:'设定和小传',content:''},old]};
 const next=appendDirectorEpisode(p,'2-1 门口 日 外\n甲：你好。');assert.strictEqual(next.episodes[1],old);assert.equal(next.firstNumber,2);assert.equal(next.added.length,1);assert.equal(parseMasterScript(next.masterScript).episodes.filter(e=>e.kind==='episode').length,2);assert.equal(parseDirectorScenes(next.added[0].content,2).length,1);
 }
 assert.equal(parseMasterScript('第 1 集\n你好\n第 2 集\n再见').episodes.filter(e=>e.kind==='episode').length,2);
 assert.throws(()=>appendDirectorEpisode({cloudLocked:true},'内容'),/锁定/);
});
