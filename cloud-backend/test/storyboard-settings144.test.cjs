const test=require('node:test'),assert=require('node:assert/strict');const {patchShot,mergeDirectorEpisodes}=require('../src/storyboard-merge.cjs');
const settings=(duration=30)=>({profileId:'p',model:'video',ratio:'16:9',duration,resolution:'720p',libtvMode:'mixed2video',libtvParams:{enableSound:'on'}});
const initial=()=>[1,2].map(n=>({id:'e'+n,episodeNumber:n,content:`${n}-1 房间 日 内\n${n}-2 街道 日 外`,prompts:[1,2].map(s=>({id:`s${n}${s}`,label:`${n}-${s}-1`,content:'保留人工提示词',generationConfig:{references:[{id:'ref'}],duration:5}}))}));
test('scene applies to every shot of that scene only; project overrides every episode and resets prior scene overrides',()=>{
 let rows=patchShot(initial(),{operation:'settings',scope:'scene',episodeId:'e1',sceneId:'1-1',revision:'scene',settings:settings(15)});
 assert.equal(rows[0].storyboardPrompts[0].generationConfig.duration,15);assert.equal(rows[0].storyboardPrompts[1].generationConfig.duration,5);assert.equal(rows[1].prompts[0].generationConfig.duration,5);assert.equal(rows[0].prompts[0].generationConfig.duration,5);
 rows=patchShot(rows,{operation:'settings',scope:'project',revision:'all',settings:{...settings(),apiKey:'must-not-persist',prompt:'must-not-replace'}});
 for(const ep of rows){assert.deepEqual(ep.storyboardDefaultSettings.scenes,{});for(const shot of ep.storyboardPrompts){assert.equal(shot.generationConfig.duration,30);assert.equal(shot.content,'保留人工提示词');assert.deepEqual(shot.generationConfig.references,[{id:'ref'}]);assert.equal(shot.generationConfig.apiKey,undefined);assert.equal(shot.generationConfig.storyboardDefaultsRevision,'all');}}
 rows=patchShot(rows,{episodeId:'e1',shotId:'s11',editPolicy:'direct',updates:{generationConfig:{duration:2,storyboardDefaultsRevision:'stale'}}});assert.equal(rows[0].storyboardPrompts[0].generationConfig.duration,30);
 const manual=patchShot(rows,{episodeId:'e1',shotId:'s11',editPolicy:'direct',updates:{generationConfig:{duration:10,storyboardDefaultsRevision:'all'}}});assert.equal(manual[0].storyboardPrompts[0].generationConfig.duration,10);
 rows=patchShot(rows,{operation:'settings',scope:'scene',episodeId:'e2',sceneId:'2-2',revision:'e2-scene',settings:settings(8)});assert.equal(rows[0].storyboardPrompts[0].generationConfig.duration,30);assert.equal(rows[1].storyboardPrompts[0].generationConfig.duration,30);assert.equal(rows[1].storyboardPrompts[1].generationConfig.duration,8);
 const newShot=patchShot(rows,{operation:'create',editPolicy:'direct',episodeId:'e2',scene:'2-2',shotId:'manual'});assert.equal(newShot[1].storyboardPrompts.at(-1).generationConfig.duration,8);
 const sync=mergeDirectorEpisodes(rows,[...initial(),{id:'e3',episodeNumber:3,content:'3-1 新场景',prompts:[]}]);assert.equal(sync[2].storyboardDefaultSettings.global.settings.duration,30);
 assert.throws(()=>patchShot(rows,{operation:'settings',scope:'scene',episodeId:'e1',sceneId:'2-1',revision:'bad',settings:settings()}),/场景/);
 assert.throws(()=>patchShot(rows,{operation:'settings',scope:'project',revision:'bad',settings:{...settings(),duration:NaN}}),/参数/);
});
