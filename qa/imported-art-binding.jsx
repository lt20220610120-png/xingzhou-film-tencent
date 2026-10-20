import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PromptBookWorkspace} from '../src/v06/PromptBookWorkspace.jsx';
import '../src/styles.css';
import '../src/generation.css';
import '../src/collab.css';
import '../src/ocean-theme.css';
import '../src/studio-theme.css';
import '../src/brand-theme.css';
import '../src/workspace-readability.css';

const image=(title,color)=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="300" height="180" fill="${color}"/><text x="150" y="100" fill="white" text-anchor="middle" font-size="28">${title}</text></svg>`);
const refs=[['a','张三','character','#396791'],['b','李四','character','#43766a'],['room','客厅','scene','#726254'],['cup','张三-杯子','prop','#665783'],['phone','手机','prop','#5f768b']].map(([id,name,category,color])=>({id,name:name+'.png',category,kind:'image',url:image(name,color)}));
const doc=`【1-1-1】【基础信息】\n人物：张三\n场景：客厅\n道具：无\n【镜头】\n张三说话。\n【1-1-2】【基础设定】\n人物：张三、李四\n场景：客厅\n道具：张三-杯子\n【镜头】\n张三把杯子递给李四。\n【2-1-1】【基础信息】\n人物：王五\n场景：街道\n道具：无`;
const read=()=>JSON.parse(localStorage.getItem('qa-import-binding-record')||'null');
window.qaImported={submits:[],ai:0,vision:0};
const api={
 promptArtStatus:async()=>({enabled:true}),promptArtList:async()=>[],
 importFullScript:async()=>({content:doc,fileName:'已有素材验收剧'}),
 generationImportEpisodeMedia:async()=>({episodes:{},scenes:{'1-1':refs},count:5,warnings:[]}),
 promptArtLoad:async()=>read(),promptArtSave:async({baseRevision,data,accountId})=>{if((read()?.revision||0)!==baseRevision)throw Error('关联已更新');const next={...data,accountId,revision:baseRevision+1};localStorage.setItem('qa-import-binding-record',JSON.stringify(next));return next;},
 promptArtImageInputs:async({references})=>{window.qaImported.vision++;return references.map(ref=>({id:ref.id,dataUrl:ref.url}));},
 aiChat:async({messages})=>{
  window.qaImported.ai++;const data=JSON.parse(messages[1].content);
  if(window.qaImported.hold){await new Promise(resolve=>window.qaImported.release=resolve);}
  if(!data.entry)return JSON.stringify({cards:data.cards.map(card=>({...card,sourceName:card.name,certainty:'clear',name:refs.find(ref=>ref.id===card.uid).name.replace('.png',''),description:'根据素材名称，未看图'}))});
  if(window.qaImported.ai===2)return '{"needs":[]}';
  return JSON.stringify({certainty:'clear',needs:data.previousNeeds.map(need=>({...need,reason:'基础信息与本条镜头一致'}))});
 },
 generationList:async()=>[],saveState:async()=>{},generationSubmit:async input=>window.qaImported.submits.push(input)
};
function Fixture(){
 const [state,setState]=useState(()=>JSON.parse(localStorage.getItem('qa-import-binding-state')||'null')||{
  apiProfiles:[{id:'text',name:'模拟关联模型',model:'mock',endpoint:'https://example.invalid/v1',protocol:'chat'}],activeApiId:'text',
  mediaProfiles:[{id:'video',kind:'video',name:'模拟视频接口',provider:'openai-compatible',endpoint:'https://example.invalid',apiKey:'mock-only',model:'qa-model',capabilities:{maxImages:10,maxVideos:0,maxAudios:0,ratios:['16:9']},models:[{id:'qa-model',name:'模拟多参考模型',maxImages:10,ratios:['16:9'],durations:[5],resolutions:['720p']}]}],activeVideoApiId:'video'
 }),[account,setAccount]=useState('qa');
 const update=action=>setState(current=>{const next=typeof action==='function'?action(current):action;localStorage.setItem('qa-import-binding-state',JSON.stringify(next));return next;});
 return <main style={{maxWidth:1500,margin:'20px auto',padding:20}}><button onClick={()=>setAccount(account==='qa'?'other':'qa')}>切换测试账号</button><PromptBookWorkspace state={state} setState={update} api={api} accountId={account} onSubmit={api.generationSubmit}/></main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
