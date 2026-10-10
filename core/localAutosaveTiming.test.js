import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('real App autosave recovers its maximum checkpoint after a deadline falls inside IME composition',()=>{
 const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('  const saveDeadline = useRef'),source.indexOf('  // 清理过期会话'));
 let now=0,id=0;const timers=new Map(),effects=[],events={},saves=[];
 vm.runInNewContext(code,{useRef:value=>({current:value}),useEffect:fn=>effects.push(fn),initialized:true,state:{},stateRef:{current:{}},Date:{now:()=>now},setTimeout:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:now+ms});return key;},clearTimeout:key=>timers.delete(key),flushEditing:()=>{},localStorage:{setItem:()=>saves.push(now)},STORAGE:'fixture',JSON,console,persistence:{enqueue:()=>{},flush:async()=>{}},setCreatorSaveStatus:()=>{},document:{activeElement:null,addEventListener:(name,fn)=>events[name]=fn,removeEventListener:()=>{}},window:{addEventListener:()=>{},removeEventListener:()=>{}}});
 effects.forEach(fn=>fn());
 const advance=time=>{for(;;){const next=[...timers].filter(([,job])=>job.at<=time).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=time;};
 const input=()=>{events.input({target:{matches:()=>true}});effects[0]();};
 for(let t=300;t<=14700;t+=300){advance(t);input();}
 advance(14900);events.compositionstart();advance(15100);assert.deepEqual(saves,[]);
 events.compositionend({target:{matches:()=>true}});
 for(let t=15400;t<=46000;t+=300){advance(t);input();}
 assert.ok(saves.length>=2,'continuous typing must resume bounded checkpoints after composition');
 assert.ok(saves[0]>=15100&&saves[0]<=30100);
});

test('DOM-buffered continuous input starts the App checkpoint immediately, without waiting for a React edit commit',()=>{
 const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('  const saveDeadline = useRef'),source.indexOf('  // 清理过期会话'));
 let now=0,id=0;const timers=new Map(),effects=[],events={},saves=[];
 vm.runInNewContext(code,{useRef:value=>({current:value}),useEffect:fn=>effects.push(fn),initialized:true,state:{},stateRef:{current:{}},Date:{now:()=>now},setTimeout:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:now+ms});return key;},clearTimeout:key=>timers.delete(key),flushEditing:()=>{},localStorage:{setItem:()=>saves.push(now)},STORAGE:'fixture',JSON,console,persistence:{enqueue:()=>{},flush:async()=>{}},setCreatorSaveStatus:()=>{},document:{activeElement:null,addEventListener:(name,fn)=>events[name]=fn,removeEventListener:()=>{}},window:{addEventListener:()=>{},removeEventListener:()=>{}}});
 effects.forEach(fn=>fn());
 const advance=time=>{for(;;){const next=[...timers].filter(([,job])=>job.at<=time).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=time;};
 advance(2000);saves.length=0;
 for(let t=2300;t<=17500;t+=300){advance(t);events.input({target:{matches:()=>true}});}
 assert.equal(saves.length,1);assert.equal(saves[0],17300);
});
