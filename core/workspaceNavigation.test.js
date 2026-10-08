import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationForRole} from './workspaceNavigation.js';
test('switching authorized roles preserves the current shared tool page',()=>{
 const account={roles:['creator','director'],isAdmin:true};
 for(const nav of ['skills','apis','settings','admin'])assert.equal(navigationForRole({account,targetRole:'director',currentNav:nav,remembered:'canvas'}),nav);
});
test('switching workspaces restores the target roles last role-specific page',()=>{
 assert.equal(navigationForRole({account:{roles:['creator','director']},targetRole:'director',currentNav:'studio',remembered:'canvas'}),'canvas');
 assert.equal(navigationForRole({account:{roles:['creator','director']},targetRole:'creator',currentNav:'canvas',remembered:'studio'}),'studio');
 assert.equal(navigationForRole({account:{roles:['creator','director']},targetRole:'creator',currentNav:'canvas',remembered:'director'}),'fruit');
});
test('a locked role or unknown target cannot enter a workspace through quick switching',()=>{
 assert.throws(()=>navigationForRole({account:{roles:['creator']},targetRole:'director',currentNav:'settings'}),/身份/);
 assert.throws(()=>navigationForRole({account:{roles:['creator','director']},targetRole:'admin',currentNav:'settings'}),/身份/);
});
test('non-admins cannot preserve an administrator route across role selection',()=>{
 assert.equal(navigationForRole({account:{roles:['creator','director'],isAdmin:false},targetRole:'director',currentNav:'admin'}),'director');
});
