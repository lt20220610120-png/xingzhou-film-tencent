import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {WorldStore} from '../store.mjs';import {createWorld,branchState} from '../engine.js';
test('SQLite world saves and evidence are durable, versioned and isolated',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-world-store-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let db=new WorldStore(path.join(dir,'worlds.sqlite'));const w=createWorld({characters:[{id:'hero',name:'主角'}]},{id:'world'});assert.equal(db.save(w,0),1);assert.throws(()=>db.save({...w,name:'过期写入'},0),/版本/);db.close();
 db=new WorldStore(path.join(dir,'worlds.sqlite'));assert.equal(db.load('world').revision,1);assert.deepEqual(branchState(db.load('world').world),branchState(w));assert.equal(db.load('other'),null);assert.equal(db.save({...w,name:'新版'},1),2);db.close();
});
