import test from 'node:test';
import assert from 'node:assert/strict';
import * as refs from './generationReferences.js';
const own={id:'m',projectId:'p',userId:'u',kind:'audio',note:'参考素材 1-1-1',url:'https://x.invalid/a.wav'};
test('only the active uploader can remove plain project audio, image or video references',()=>{assert.equal(typeof refs.canDeleteUploadedReference,'function');for(const kind of ['audio','image','video'])assert.equal(refs.canDeleteUploadedReference({...own,kind},{projectId:'p',accountId:'u',canEdit:true}),true);});
test('picker never offers deletion for adopted, foreign, unknown-owner or readonly entries',()=>{assert.equal(typeof refs.canDeleteUploadedReference,'function');for(const row of [{...own,adoptedVoice:true},{...own,assetId:'asset'},{...own,userId:'other'},{...own,userId:undefined},{...own,projectId:'other'}])assert.equal(refs.canDeleteUploadedReference(row,{projectId:'p',accountId:'u',canEdit:true}),false);assert.equal(refs.canDeleteUploadedReference(own,{projectId:'p',accountId:'u',canEdit:false}),false);});
test('generated outputs with ordinary media kinds are not deletable through upload picker',()=>{assert.equal(refs.canDeleteUploadedReference({...own,note:'1-1-1 [shot:s]'},{projectId:'p',accountId:'u',canEdit:true}),false);});
test('an ordinary upload alias of an adopted voice is protected before showing trash',()=>{assert.equal(refs.canDeleteUploadedReference(own,{projectId:'p',accountId:'u',canEdit:true,protectedReferences:[{id:'voice:one',url:own.url+'?signed=other'}]}),false);});
