import test from 'node:test';
import assert from 'node:assert/strict';
import { imagePreviewIdentity, createDirectorSync } from './cloudTraffic.js';
test('signature rotation keeps preview mounted, but replacing original changes identity',()=>{
  const base='https://xingzhou-media-test-1469762028.cos.ap-guangzhou.myqcloud.com/projects/p/image/a.png';
  assert.equal(imagePreviewIdentity({url:base+'?q-signature=a'}),imagePreviewIdentity({url:base+'?q-signature=b'}));
  assert.notEqual(imagePreviewIdentity({url:base}),imagePreviewIdentity({url:base.replace('a.png','b.png')}));
  assert.notEqual(imagePreviewIdentity({url:'https://external.test/a?v=1'}),imagePreviewIdentity({url:'https://external.test/a?v=2'}));
});
test('unchanged local director source skips repeat write while edits and failed saves retry',async()=>{
  const sync=createDirectorSync(); let writes=0,fail=false;
  const update=async()=>{writes++;if(fail)throw Error('offline');return {id:'p',script:'merged'};};
  const project={id:'p',myRole:'producer'},source={id:'d',masterScript:'first',episodes:[{id:'e',script:'text'}]};
  await sync(project,source,update);
  assert.equal(await sync({...project,script:'cloud edits'},structuredClone(source),update).then(p=>p.script),'cloud edits');
  assert.equal(writes,1);
  source.masterScript='second';fail=true;
  await assert.rejects(sync(project,source,update));fail=false;
  await sync(project,source,update);assert.equal(writes,3);
  await sync({...project,locked:true},{...source,masterScript:'third'},update);assert.equal(writes,3);
});
