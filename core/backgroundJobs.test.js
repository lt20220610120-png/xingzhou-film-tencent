import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackgroundJobs} from './backgroundJobs.js';
test('episode unmount does not remove running work; independent episodes retain errors and completion',()=>{
 const jobs=createBackgroundJobs();let notifications=0;
 const unsubscribe=jobs.subscribe(()=>notifications++);
 assert.equal(jobs.start('episode1',{model:'A'}),true);unsubscribe();
 assert.equal(jobs.start('episode2',{model:'B'}),true);
 assert.equal(jobs.start('episode1',{model:'B'}),false);
 assert.equal(jobs.get('episode1').model,'A');
 jobs.finish('episode2','provider failure');
 assert.equal(jobs.get('episode1').status,'running');
 const second=jobs.subscribe(()=>notifications++);
 assert.equal(jobs.get('episode2').error,'provider failure');
 jobs.finish('episode1');assert.equal(jobs.get('episode1').status,'completed');
 assert.equal(notifications,2);second();
});
