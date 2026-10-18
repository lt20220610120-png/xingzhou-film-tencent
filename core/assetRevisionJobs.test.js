import test from 'node:test';import assert from 'node:assert/strict';
import {createAssetDraftStore} from './collabAssetDrafts.js';
test('drafts notify mounted editors and preserve account scope guard',()=>{
 const store=createAssetDraftStore({getItem:()=>null,setItem:()=>{},removeItem:()=>{}},'account',{isCurrent:()=>false});assert.equal(typeof store.subscribe,'function');let notices=0;store.subscribe('p','a',()=>notices++);store.write('p','a','new');assert.equal(notices,1);assert.equal(store.isCurrent(),false);
});
test('background revision persists to its own asset after unmount and rejects a duplicate paid call',async()=>{
 const {createAssetRevisionJobs}=await import('./assetRevisionJobs.js');const store=createAssetDraftStore({getItem:()=>null,setItem:()=>{},removeItem:()=>{}},'account');const jobs=createAssetRevisionJobs(store);let resolve,calls=0;const writes=[];const api={aiChat:()=>{calls++;return new Promise(r=>resolve=r);},collabUpdateAsset:async p=>{writes.push(p);return {updated_at:'2026-01-01'};}};
 const task={projectId:'p',asset:{id:'a',category:'prop',description:'old'},inputDescription:'old',profile:{id:'model'},instruction:'make gold',api};const work=jobs.start(task);assert.equal(jobs.read('p','a').status,'running');const duplicate=jobs.start(task);resolve('new gold');await Promise.all([work,duplicate]);assert.equal(calls,1);assert.equal(writes.length,1);assert.equal(writes[0].assetId,'a');assert.equal(store.read('p','a').content,'new gold');
});
test('new edits and account changes cannot be overwritten by a delayed AI result',async()=>{
 const {createAssetRevisionJobs}=await import('./assetRevisionJobs.js');let current=true,resolve;const store=createAssetDraftStore({getItem:()=>null,setItem:()=>{},removeItem:()=>{}},'account',{isCurrent:()=>current});const jobs=createAssetRevisionJobs(store);let writes=0;const task={projectId:'p',asset:{id:'a',category:'prop',description:'old'},inputDescription:'old',profile:{id:'m'},instruction:'gold',api:{aiChat:()=>new Promise(r=>resolve=r),collabUpdateAsset:async()=>{writes++;}}};
 let work=jobs.start(task);store.write('p','a','human newer');resolve('AI older');await work;assert.equal(store.read('p','a').content,'human newer');assert.equal(jobs.read('p','a').status,'conflict');assert.equal(writes,0);
 work=jobs.start({...task,inputDescription:'human newer'});current=false;resolve('other account late');await work;assert.equal(writes,0);assert.equal(store.read('p','a').content,'human newer');
});
test('an unmounted old workspace checks the actual desktop account before writing',async()=>{
 const {createAssetRevisionJobs}=await import('./assetRevisionJobs.js');const store=createAssetDraftStore({getItem:()=>null,setItem:()=>{},removeItem:()=>{}},'old');let writes=0;
 const jobs=createAssetRevisionJobs(store);await jobs.start({projectId:'p',asset:{id:'a',category:'prop',description:'old'},instruction:'change',profile:{id:'m'},api:{aiChat:async()=> 'new',authSession:async()=>({id:'other'}),collabUpdateAsset:async()=>{writes++;}}});assert.equal(writes,0);assert.equal(jobs.read('p','a').status,'error');
});
test('a costume inherits the latest first-look draft even before its cloud save completes',async()=>{
 const {createAssetRevisionJobs}=await import('./assetRevisionJobs.js');const store=createAssetDraftStore({getItem:()=>null,setItem:()=>{},removeItem:()=>{}},'account');store.write('p','base','男性，长脸，蓝色眼睛，金色短发；服装：制服。');
 const base={id:'base',category:'character',name:'【米洛-制服】',description:'男性，棕色眼睛；服装：制服。'},variant={id:'variant',category:'character',name:'【米洛-礼服】',description:'参考【米洛-制服】；服装：礼服。'};
 await createAssetRevisionJobs(store).start({projectId:'p',asset:variant,assets:[base,variant],instruction:'换白礼服',profile:{id:'m'},api:{aiChat:async p=>{assert.match(p.messages[1].content,/蓝色眼睛/);assert.doesNotMatch(p.messages[1].content,/棕色眼睛/);return '白礼服。';},collabUpdateAsset:async()=>({})}});
 assert.match(store.read('p','variant').content,/白礼服/);
});
