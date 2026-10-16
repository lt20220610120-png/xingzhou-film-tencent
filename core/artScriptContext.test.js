import test from 'node:test';import assert from 'node:assert/strict';
import {artScriptSource,artScriptFingerprint,ensureArtScriptContext} from './artScriptContext.js';
const summary={background:'架空现代纽约，魔法工业化',era:'现代，纽约',population:'未明确人种，需核对',tone:'都市奇幻、魔法职场',warnings:['族群未明示，不凭姓名确定']};
function fixture(){let data={episodes:{}},calls=[];return {store:{snapshot:()=>data,setContext:async value=>{data={...data,scriptContext:structuredClone(value)}}},calls,api:{aiChat:async p=>{calls.push(p);return {output:JSON.stringify(summary)};}},profile:{id:'p',model:'test'},get data(){return data}};}
test('whole-script source retains opening, settings and all episodes without duplicating identical text',()=>{
 const p={script:'总设定\n第一集正文',episodes:[{title:'设定和小传',kind:'setting',content:'人物背景'},{title:'第1集',content:'第一集正文'},{title:'第2集',content:'第二集正文'}]};
 const source=artScriptSource(p);assert.equal(source.split('第一集正文').length-1,1);assert.match(source,/总设定/);assert.match(source,/人物背景/);assert.match(source,/第二集正文/);
 assert.notEqual(artScriptFingerprint(p),artScriptFingerprint({...p,episodes:[...p.episodes,{title:'第3集',content:'尾集'}]}));
});
test('context covers every chunk, persists before proceeding, and caches only unchanged source',async()=>{
 const f=fixture(),project={script:'开头'+ '甲'.repeat(220)+'尾集族群信息',episodes:[]};
 const result=await ensureArtScriptContext({...f,project,maxChunkChars:70});
 assert.ok(f.calls.length>=5);assert.match(f.calls.map(c=>c.messages.at(-1).content).join(''),/尾集族群信息/);
 assert.equal(result.summary.background,summary.background);assert.match(result.genre,/背景：/);assert.match(result.genre,/时代：/);assert.match(result.genre,/人种与族群：/);assert.match(result.genre,/风格：/);
 assert.ok(f.calls[0].messages[0].content.includes('不依据姓名'));assert.equal(f.data.scriptContext.complete,true);
 const count=f.calls.length;await ensureArtScriptContext({...f,project,maxChunkChars:70});assert.equal(f.calls.length,count);
 await ensureArtScriptContext({...f,project:{...project,script:project.script+'新增结局'},maxChunkChars:70});assert.ok(f.calls.length>count);
});
test('interrupted context resumes from last saved segment without inventing a completed premise',async()=>{
 const f=fixture(),project={script:'甲'.repeat(150)},original=f.api.aiChat;let n=0;
 f.api.aiChat=async p=>{if(++n===2)throw Error('temporary API error');return original(p);};
 await assert.rejects(ensureArtScriptContext({...f,project,maxChunkChars:70}),/temporary/);assert.equal(f.data.scriptContext.chunks.length,1);assert.notEqual(f.data.scriptContext.complete,true);
 f.api.aiChat=original;const before=f.calls.length;await ensureArtScriptContext({...f,project,maxChunkChars:70});assert.equal(f.calls.length-before,3);assert.equal(f.data.scriptContext.complete,true);
});
