const test=require('node:test');
const assert=require('node:assert/strict');
const {createProgressReporter}=require('./update-progress.cjs');

test('高频下载分块会被节流且完成事件立即达到 100%',()=>{
 let now=0;const events=[];
 const report=createProgressReporter(p=>events.push(p),{interval:125,now:()=>now});
 for(let i=1;i<=100;i++){report({transferred:i,total:100});now+=5}
 report({transferred:100,total:100},true);
 assert.ok(events.length<=6,`事件过多：${events.length}`);
 assert.deepEqual(events.at(-1),{percent:100,transferred:100,total:100});
});

test('下载百分比保持单调且不会超过 100%',()=>{
 let now=0;const events=[];
 const report=createProgressReporter(p=>events.push(p),{interval:10,now:()=>now});
 report({transferred:80,total:100});now=20;
 report({transferred:60,total:100});now=40;
 report({transferred:120,total:100});
 assert.deepEqual(events.map(x=>x.percent),[80,80,100]);
});
