import test from 'node:test';
import assert from 'node:assert/strict';
import {formatPromptTimingMetadata,extractPromptTimingMetadata,markPromptTimingStale} from './promptTiming.js';
import {parsePromptBook,entryValue,saveEntryValue} from './promptBook.js';
import {buildPromptHistoryExport,updateDirectorPromptEverywhere} from './projectStore.js';

const timed={id:'a',label:'1-1-1',content:'光影基调：自然光\n正文30秒只是叙述。',segmentationMode:'auto',estimatedSeconds:9.2,recommendedDurationSeconds:10,maxDurationSeconds:30,durationStatus:'estimated',timingRulesVersion:1};
test('automatic export imports duration outside the untouched Skill content without selecting video duration',()=>{
 const exported=buildPromptHistoryExport({name:'fixture',episodes:[{prompts:[timed]}]});
 assert.match(exported,/【1-1-1】\n行舟影视时长：建议=10秒；上限=30秒；状态=估算\n/);
 const book=parsePromptBook(exported,'fixture','book'),entry=book.entries[0];
 assert.equal(entry.recommendedDurationSeconds,10);assert.equal(entry.maxDurationSeconds,30);
 assert.equal(entry.durationStatus,'estimated');assert.ok(entry.prompt.includes(timed.content));
 assert.ok(!entry.prompt.includes('行舟影视时长：'));assert.equal(entryValue(book,entry).duration,undefined);
 const edited=saveEntryValue(book,entry.id,{...entryValue(book,entry),prompt:'修改正文'});assert.equal(edited.entries[0].durationStatus,'needs-review');
});
test('needs-review metadata roundtrips, ordinary old records get no invented duration',()=>{
 const changed=markPromptTimingStale(timed);assert.equal(changed.recommendedDurationSeconds,10);
 assert.equal(extractPromptTimingMetadata(formatPromptTimingMetadata(changed)+'\n正文').timing.durationStatus,'needs-review');
 const old={content:'旧提示词',unknown:true};assert.equal(markPromptTimingStale(old),old);assert.equal(formatPromptTimingMetadata(old),'');
});
test('metadata is a strict standalone leading row, malformed or body duration remains unchanged',()=>{
 for(const text of ['正文30秒','行舟影视时长：建议=31秒；上限=30秒；状态=估算\n正文','行舟影视时长：建议=1.5秒；上限=30秒；状态=估算\n正文','行舟影视时长：建议=0秒；上限=30秒；状态=估算','正文\n行舟影视时长：建议=10秒；上限=30秒；状态=估算','引用行舟影视时长：建议=10秒；上限=30秒；状态=估算']){
  assert.deepEqual(extractPromptTimingMetadata(text),{text});
 }
 const text='\r\n行舟影视时长：建议=10秒；上限=30秒；状态=估算\r\n  正文\r\n';
 assert.equal(extractPromptTimingMetadata(text).text,'\r\n  正文\r\n');
});
test('edits synchronize history and current episode while retaining estimate as needs-review',()=>{
 const state={directorProjects:[{id:'p',episodes:[{id:'e',prompts:[timed]}],promptHistory:[timed]}]};
 const next=updateDirectorPromptEverywhere(state,'p','a',{content:'修改内容'}).directorProjects[0];
 assert.equal(next.episodes[0].prompts[0].durationStatus,'needs-review');assert.equal(next.promptHistory[0].durationStatus,'needs-review');
 assert.equal(next.promptHistory[0].recommendedDurationSeconds,10);
});
