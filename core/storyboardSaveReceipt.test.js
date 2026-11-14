import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeStoryboardSaveReceipt} from './storyboardSaveReceipt.js';
test('small save receipt preserves latest other shots and rejects publication changes',()=>{
 const project={id:'p',script:'whole script',episodes:[{id:'e',storyboardPrompts:[{id:'s',content:'old',storyboardPublicationId:'v1'},{id:'other',content:'new concurrent edit'}]}]};
 const saved={id:'p',storyboardReceipt:{episodeId:'e',publicationId:'v1',separate:true,shot:{id:'s',content:'saved',storyboardPublicationId:'v1'}}};
 const next=mergeStoryboardSaveReceipt(project,saved);assert.equal(next.episodes[0].storyboardPrompts[0].content,'saved');assert.equal(next.episodes[0].storyboardPrompts[1].content,'new concurrent edit');assert.equal(next.script,project.script);
 saved.storyboardReceipt.publicationId='old';assert.equal(mergeStoryboardSaveReceipt(project,saved).episodes[0],project.episodes[0]);
});
test('first direct save materializes the separate storyboard copy without replacing source prompts',()=>{
 const project={id:'p',episodes:[{id:'e',prompts:[{id:'s',content:'source'},{id:'other',content:'other'}]}]};
 const saved={id:'p',storyboardReceipt:{episodeId:'e',publicationId:'pub-1',separate:true,shot:{id:'s',content:'edited',storyboardPublicationId:'pub-1'}}};
 const next=mergeStoryboardSaveReceipt(project,saved),episode=next.episodes[0];
 assert.equal(episode.prompts[0].content,'source');
 assert.equal(episode.storyboardPrompts[0].content,'edited');
 assert.equal(episode.storyboardPrompts[1].content,'other');
 assert.equal(episode.storyboardWorkspacePolicy,'published');
});
