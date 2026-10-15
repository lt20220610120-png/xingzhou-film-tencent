import test from 'node:test';
import assert from 'node:assert/strict';
import * as batch from './artImageBatch.js';
const a=(id,category='character',extra={})=>({id,category,name:`【${id}】`,first_episode:1,episodes:[1],...extra});
const rows=[a('base','character',{name:'【林舟-常服】'}),a('variant','character',{name:'【林舟-礼服】',first_episode:2}),a('done','character',{images:[{id:'i',url:'saved'}]}),a('scene','scene'),a('prop','prop'),a('archived','character',{episodes:[],sceneIds:[]})];
test('category batch defaults to every unfinished costume, deduplicates reuse and excludes archived assets',()=>{
 assert.equal(typeof batch.planAssetCategoryBatch,'function');
 const plan=batch.planAssetCategoryBatch([...rows,rows[0]],{category:'character'});
 assert.deepEqual(plan.map(j=>[j.asset.id,j.dependency]),[['base',null],['variant','base']]);
 assert.deepEqual(batch.planAssetCategoryBatch(rows,{category:'prop'}).map(j=>j.asset.id),['prop']);
});
test('explicit selection never spills into another category or silently reselects a cancelled baseline',()=>{
 assert.equal(typeof batch.planAssetCategoryBatch,'function');
 assert.deepEqual(batch.planAssetCategoryBatch(rows,{category:'character',selectedIds:[]}),[]);
 const plan=batch.planAssetCategoryBatch(rows,{category:'character',selectedIds:['variant','scene','prop','archived']});
 assert.deepEqual(plan.map(j=>[j.asset.id,j.dependency]),[['variant','base']]);
});
test('only an explicitly selected completed card may be regenerated; whole-art defaults still skip it',()=>{
 assert.equal(typeof batch.planAssetCategoryBatch,'function');
 assert.deepEqual(batch.planAssetCategoryBatch(rows,{category:'character',selectedIds:['done']}).map(j=>j.asset.id),['done']);
 assert.ok(!batch.planArtImageBatch(rows).some(j=>j.asset.id==='done'));
});
test('category plan retains dependency scheduling and blocks dependent paid calls after a failed baseline',async()=>{
 assert.equal(typeof batch.planAssetCategoryBatch,'function');
 const calls=[];const result=await batch.runArtImageBatch(batch.planAssetCategoryBatch(rows,{category:'character'}),{concurrency:2,generate:async asset=>{calls.push(asset.id);throw Error('upstream failed');}});
 assert.deepEqual(calls,['base']);assert.equal(result.results.length,2);
});
