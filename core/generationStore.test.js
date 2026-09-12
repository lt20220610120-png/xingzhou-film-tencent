import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationTask, updateGenerationTask, generationHistory } from './generationStore.js';
test('generation task persists lifecycle states and history',()=>{ const t=createGenerationTask({kind:'image',prompt:'cat'}); assert.equal(t.status,'pending'); const s=updateGenerationTask([t],t.id,{status:'success',url:'x'}); assert.equal(s[0].status,'success'); assert.equal(generationHistory(s).length,1); });
test('task supports failure',()=>assert.equal(updateGenerationTask([createGenerationTask({kind:'video'})],'missing',{status:'failure'}).length,1));
