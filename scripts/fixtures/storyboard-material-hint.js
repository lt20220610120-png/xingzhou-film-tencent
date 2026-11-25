import {createInitialState} from '../../core/projectStore.js';
import {applyArtReviewCandidate,newArtReview} from '../../core/artReview.js';
import {bindingSnapshot,entryBindingSignature,saveDistribution} from '../../core/promptArtBinding.js';
import {saveBindingVersion,selectBindingVersion} from '../../core/promptBindingVersions.js';
import {promptHumanReviewSignature} from '../../core/promptReviewBatch.js';

const sceneId='1-1';
const content='1-1 客厅 日 内\n演员走进门。';
const prompts=['素材齐全','素材待核实'].map((name,index)=>({id:`prompt-${index+1}`,label:`1-1-${index+1}`,sceneLabel:sceneId,content:`【基础设定】\n人物：演员（参考@）\n${name}`}));
const episode={id:'hint-episode',number:1,episodeNumber:1,title:'第1集',content,prompts,storyboardPrompts:prompts.map(prompt=>({...prompt,sourcePromptId:prompt.id,sourceContent:prompt.content,generationConfig:{references:[]}}))};
const project={id:'hint-project',name:'素材提示隔离项目',owner_name:'qa',myRole:'producer',storageMode:'local',episodes:[episode]};
const account={id:'material-hint-isolated',username:'qa',roles:['creator','director'],isAdmin:true,activeRole:'director'};
const name='【演员】';
const item={id:'actor',category:'character',name,description:'短发，灰色上衣。',ready:true};
const ledger={episodes:{1:applyArtReviewCandidate(newArtReview(episode),episode,{items:[item],mapping:[{sceneId,assets:[{category:'character',name}]}],inventory:'角色清单',complete:true,warnings:[]})}};
const current=bindingSnapshot(project,ledger,[]);
const {snapshot}=selectBindingVersion(current);
const decisions=Object.fromEntries(snapshot.entries.map(entry=>{
 const start=entry.prompt.indexOf('演员');
 const need={id:'actor-need',text:'演员',start,end:start+2,category:'character',cardUid:snapshot.cards[0].uid,locked:true,
   visibility:entry.id==='prompt-1'?'excluded':'visible',reason:'隔离核实'};
 return [entry.id,saveDistribution(snapshot,entry,{origin:'manual',signature:entryBindingSignature(snapshot,entry),needs:[need],speakers:[]})];
}));
const saved=saveBindingVersion(null,snapshot,decisions);
const ready=snapshot.entries[0];
saved.versions[snapshot.versionId].reviews={[ready.id]:{signature:promptHumanReviewSignature(snapshot,ready,decisions[ready.id]),published:true}};

const answers={authSession:account,licenseCheck:{status:'active',allowed:true,authenticated:true},appVersion:'2.8.209',
 loadState:createInitialState(),collabListProjects:[project],collabIsProducer:true,collabGetProject:project,
 promptArtLoad:saved,promptArtStatus:{enabled:true},artReviewLoadLocal:ledger,checkUpdate:null};
const paidCalls=window.materialHintPaidCalls=[];
localStorage.setItem('xz-role','director');
window.xingzhou=new Proxy({}, {get(_,key){
 if(typeof key!=='string'||key==='then')return undefined;
 if(key.startsWith('on'))return ()=>()=>{};
 return async()=>{
  if(/^(?:aiChat|audioGenerate|generationSubmit|imageGenerate|videoGenerate|generate|storyboardBatchStart|storyboardBatchResume)/i.test(key)){
   paidCalls.push(key);
   throw Error('隔离环境禁止调用生成接口');
  }
  return structuredClone(answers[key]??[]);
 };
}});
await import('../../src/main.jsx');
