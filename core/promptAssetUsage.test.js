import test from 'node:test';
import assert from 'node:assert/strict';
import {assetPromptUsage,storyboardPromptValue,storyboardSaveUpdates} from './promptAssetUsage.js';
import {entryBindingSignature} from './promptArtBinding.js';

function fixture(){
 const cards=[['a','character','【张三】'],['b','character','【李四】'],['s','scene','【客厅】'],['p','prop','【茶杯】']].map(([uid,category,name])=>({uid,assetId:uid,category,name,description:'已核实描述',sceneIds:['1-1'],publishedSceneIds:['1-1'],images:[{id:uid+'-img',url:'https://test/'+uid+'.png'}]}));
 const entries=[{id:'p1',label:'1-1-1',sceneId:'1-1',sceneReady:true,prompt:'【基础设定】\n人物：张三\n场景：客厅\n道具：无'}, {id:'p2',label:'1-1-2',sceneId:'1-1',sceneReady:true,prompt:'【基础设定】\n人物：张三、李四\n场景：客厅\n道具：茶杯'}];
 const snapshot={projectId:'proj',versionId:'v1',cards,entries};
 const decisions=Object.fromEntries(entries.map((entry,i)=>[entry.id,{signature:entryBindingSignature(snapshot,entry),confirmed:true,needs:cards.filter(c=>i||['a','s'].includes(c.uid)).map(c=>{const text=c.name.slice(1,-1),start=entry.prompt.indexOf(text);return {id:c.uid,category:c.category,cardUid:c.uid,text,start,end:start+text.length,visibility:'visible',reason:'本条使用',imageId:c.images[0].id};})}]));
 return {binding:{saved:{enabled:true},snapshot,decisions},shot:{...entries[0],content:entries[0].prompt},cards,entries};
}
test('美术关联细分到已保存提示词，取消及其他场景的记录不混入',()=>{
 const f=fixture(),asset={id:'a',name:'【张三】',category:'character',sceneIds:['1-1']};
 assert.deepEqual(assetPromptUsage(f.binding,asset).promptIds,['1-1-1','1-1-2']);
 f.binding.decisions.p2.needs.find(n=>n.cardUid==='a').visibility='excluded';
 assert.deepEqual(assetPromptUsage(f.binding,asset).promptIds,['1-1-1']);
 assert.deepEqual(assetPromptUsage(null,asset),{promptMode:false,promptIds:[],sceneIds:['1-1']});
});
test('分镜只挂载本条已选图片，保存空references也可补回，模型参数保留',()=>{
 const f=fixture(),value={prompt:f.shot.content,references:[],duration:15,profileId:'video'};
 const result=storyboardPromptValue(f.binding,f.shot,value,'u');
 assert.equal(result.referenceBindingMode,'confirmed');assert.deepEqual(result.references.map(r=>r.assetId),['a','s']);
 assert.match(result.prompt,/@image1/);assert.equal(result.duration,15);assert.equal(result.bindingSourcePromptId,'p1');
 assert.equal(value.references.length,0);assert.equal(f.shot.content,f.entries[0].prompt);
 const updates=storyboardSaveUpdates(result);assert.equal(updates.content,f.entries[0].prompt);assert.match(updates.generationConfig.bindingCompiledPrompt,/@image1/);
 const edited=storyboardSaveUpdates({...result,prompt:result.prompt+'\n用户修改的动作'});
 assert.equal(edited.content,result.prompt+'\n用户修改的动作');assert.equal(edited.generationConfig.referenceBindingMode,'pending');
 assert.equal(storyboardSaveUpdates({prompt:'手工编辑分镜',references:[]}).content,'手工编辑分镜');
 const second=storyboardPromptValue(f.binding,{...f.entries[1],content:f.entries[1].prompt},{prompt:f.entries[1].prompt},'u');
 assert.deepEqual(second.references.map(r=>r.assetId),['a','b','s','p']);
});
test('无关联旧项目沿用场景；有关联但过期/漏图/改词不把整场素材冒充本条',()=>{
 const f=fixture();assert.equal(storyboardPromptValue(null,f.shot,{prompt:'旧稿'},'u'),null);
 delete f.binding.decisions.p1;
 assert.equal(storyboardPromptValue(f.binding,f.shot,{prompt:f.shot.content},'u').referenceBindingMode,'pending');
 const fresh=fixture();fresh.cards[0].images=[];
 assert.equal(storyboardPromptValue(fresh.binding,fresh.shot,{prompt:fresh.shot.content},'u').references.length,0);
 const edited=fixture(),draft={prompt:'用户未保存的新词',references:[{id:'manual',kind:'image'}]};
 const result=storyboardPromptValue(edited.binding,edited.shot,draft,'u');assert.equal(result.referenceBindingMode,'pending');assert.equal(result.prompt,draft.prompt);
});
test('旧版本同编号不同内容及歧义编号不被错误绑定',()=>{
 const f=fixture(),shot={...f.shot,id:'cloud-copy',content:'不同版本正文'};
 assert.equal(storyboardPromptValue(f.binding,shot,{prompt:shot.content},'u').referenceBindingMode,'pending');
 f.binding.snapshot.entries.push({...f.entries[0],id:'duplicate'});
 assert.equal(storyboardPromptValue(f.binding,{...f.shot,id:'cloud-copy'},{prompt:f.shot.content},'u').referenceBindingMode,'pending');
});
