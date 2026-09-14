const test=require('node:test'),assert=require('node:assert/strict');const {updateProfile}=require('../src/profile.cjs');
test('profile updates use authenticated account and whitelist fields; private auth fields excluded',async()=>{
 let target,changes;const reply=await updateProfile({userId:'other',displayName:'导演甲',bio:'介绍',tags:['导演'],avatarData:'',is_admin:true},{id:'self'}, {updateProfile:async(id,p)=>{target=id;changes=p;return {id,username:'account',display_name:p.displayName,password_hash:'private',bio:p.bio,profile_tags:p.tags};}});
 assert.equal(target,'self');assert.equal(reply.status,200);assert.equal(reply.body.account.display_name,'导演甲');assert.equal(reply.body.account.password_hash,undefined);assert.equal(changes.is_admin,undefined);
});
test('invalid avatars and oversized profile content are rejected before writing',async()=>{
 const repo={updateProfile:async()=>{throw new Error('unexpected write');}};
 for(const data of [{displayName:'x',avatarData:'https://untrusted.example/x.svg'},{displayName:'x',bio:'x'.repeat(161)},{displayName:'x',tags:['x'.repeat(21)]}])assert.equal((await updateProfile(data,{id:'a'},repo)).status,400);
});
