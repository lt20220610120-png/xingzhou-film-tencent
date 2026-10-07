import test from 'node:test';
import assert from 'node:assert/strict';
import {frameworkModelSelection as selection,frameworkModelConfig as config} from './frameworkModels.js';
const options=[{selectionId:'first'},{selectionId:'second'},{selectionId:'third'}];

test('step choices are independent and legacy defaults remain usable',()=>{
 const legacy={selection:'second',skillId:'skill',scope:'current'};
 const updated=config(legacy,'ideas','third');
 assert.equal(selection(updated,options,'ideas'),'third');
 assert.equal(selection(updated,options,'script'),'second');
 assert.equal(selection(updated,options,'ideas:simulation'),'third');
 assert.equal(updated.skillId,'skill');assert.equal(updated.scope,'current');assert.equal(legacy.modelSelections,undefined);
});
test('simulation overrides only its tool and removed models fall back to available step choices',()=>{
 const saved=config(config(config({selection:'first'},'mainline','second'),'mainline:simulation','third'),'script','first');
 assert.equal(selection(saved,options,'mainline:simulation'),'third');assert.equal(selection(saved,options,'mainline'),'second');
 assert.equal(selection(saved,options.slice(0,2),'mainline:simulation'),'second');
 assert.equal(selection(saved,[options[0]],'mainline'),'first');assert.equal(selection(saved,[],'script'),'');
 assert.equal(selection(JSON.parse(JSON.stringify(saved)),options,'mainline:simulation'),'third');
});
