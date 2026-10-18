import test from 'node:test';import assert from 'node:assert/strict';
import * as collab from './collabStore.js';
const first={id:'first',category:'character',name:'【米洛-外卖骑手制服】',description:'白人男性，长脸、棕眼、棕发，瘦高；服装：外卖员制服。',episodes:[19],first_episode:19,created_at:'2026-01-01',images:[{id:'image1',url:'https://example.invalid/first.png'}]};
const added={id:'new',category:'character',name:'【米洛-】',description:'换下外卖服，深蓝面试西装。',episodes:[19],first_episode:1,created_at:'2026-02-01',images:[]};
test('historical blank costume suffix cannot displace the existing first-image identity',()=>{
 assert.equal(collab.characterBaselineAsset(added,[added,first])?.id,'first');assert.equal(collab.resolveAssetReference(added,[added,first])?.id,'first');
});
test('wardrobe creation pins first look and AI receives its complete text plus requested change',()=>{
 assert.equal(typeof collab.wardrobeDescription,'function');const description=collab.wardrobeDescription(first,'面试装，保留外貌');assert.match(description,/参考【米洛-外卖骑手制服】/);
 const messages=collab.buildAssetRevisionMessages({category:'character',instruction:'穿面试西装',originalContent:description,baseline:first});assert.match(messages.map(m=>m.content).join('\n'),/棕眼、棕发/);assert.match(messages[0].content,/身份|外貌/);assert.match(messages[1].content,/穿面试西装/);
});
