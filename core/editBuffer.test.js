import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditBuffer} from './editBuffer.js';
function fixture(){let now=0,id=0,text='',reads=0;const jobs=new Map(),saved=[];
 const tick=ms=>{const end=now+ms;for(;;){const next=[...jobs].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;jobs.delete(next[0]);next[1].fn();}now=end;};
 const buffer=createEditBuffer({read:()=>{reads++;return text;},commit:value=>saved.push(value),setTimer:(fn,ms)=>{const key=++id;jobs.set(key,{fn,at:now+ms});return key;},clearTimer:key=>jobs.delete(key)});
 return {buffer,saved,tick,type:value=>{text=value;buffer.input();},reads:()=>reads,jobs};
}
test('continuous typing does not serialize the document or commit per character',()=>{const f=fixture();for(let i=1;i<=20;i++){f.type('文'.repeat(i));f.tick(300);}assert.equal(f.reads(),0);assert.deepEqual(f.saved,[]);f.tick(1200);assert.deepEqual(f.saved,['文'.repeat(20)]);assert.equal(f.reads(),1);});
test('long continuous writing has a bounded recovery checkpoint',()=>{const f=fixture();for(let i=0;i<50;i++){f.type(String(i));f.tick(300);}assert.deepEqual(f.saved,['49']);f.type('继续');f.tick(1200);assert.deepEqual(f.saved,['49','继续']);});
test('input-method composition prevents partial commits including deadlines and forced flush',()=>{const f=fixture();f.type('原文');f.buffer.compositionStart();f.type('zhong');f.tick(20000);assert.equal(f.buffer.flush(),false);assert.deepEqual(f.saved,[]);f.type('中文');f.buffer.compositionEnd();f.tick(1200);assert.deepEqual(f.saved,['中文']);});
test('blur and explicit save flush the latest text exactly once without later timers',()=>{const f=fixture();f.type('粘贴的最后一句');assert.equal(f.buffer.flush(),true);assert.equal(f.buffer.flush(),false);f.tick(20000);assert.deepEqual(f.saved,['粘贴的最后一句']);assert.equal(f.jobs.size,0);});
test('external replacement cancels an obsolete pending document',()=>{const f=fixture();f.type('旧版本');f.buffer.cancel();f.tick(20000);assert.deepEqual(f.saved,[]);f.type('新版本');f.buffer.flush();assert.deepEqual(f.saved,['新版本']);});
