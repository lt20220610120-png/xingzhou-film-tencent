import test from 'node:test';
import assert from 'node:assert/strict';
import {filterCreatorProjects} from './creatorWorkspace.js';

test('original subtype filters cannot hide rewrite projects when switching channels or revisiting areas',()=>{
 const projects=[{id:'rewrite',mode:'rewrite',creator:{mode:'rewrite'}},{id:'free',mode:'original',creator:{mode:'free'}},{id:'framework',mode:'original',creator:{mode:'framework'}},{id:'migrated-rewrite',mode:'original',creator:{mode:'rewrite'}}];
 const original=JSON.stringify(projects);
 assert.deepEqual(filterCreatorProjects(projects,{channel:'original',originalFilter:'framework'}).map(p=>p.id),['framework']);
 for(const originalFilter of ['framework','free','all'])assert.deepEqual(filterCreatorProjects(projects,{channel:'rewrite',originalFilter}).map(p=>p.id),['rewrite','migrated-rewrite']);
 assert.deepEqual(filterCreatorProjects(projects,{channel:'original',originalFilter:'free'}).map(p=>p.id),['free']);
 assert.deepEqual(filterCreatorProjects(projects,{channel:'original'}).map(p=>p.id),['free','framework']);
 assert.equal(JSON.stringify(projects),original);
 assert.deepEqual(filterCreatorProjects([{id:'fruit'},{id:'ip',creator:{mode:'ip'}}],{kind:'fruit',originalFilter:'framework'}).map(p=>p.id),['fruit']);
});
