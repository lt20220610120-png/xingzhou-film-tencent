import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SoftwareLicenseBoundary} from '../../src/v06/SoftwareLicense.jsx';
import {RegistrationScreen} from '../../src/v06/AccountAccess.jsx';
import {ApiLibrary} from '../../src/v06/GlobalTools.jsx';
import {createInitialState} from '../../core/projectStore.js';
import './access-styles.js';
const mode=new URLSearchParams(location.search).get('mode')||'start';
const account={id:'qa-user',username:'导演测试',displayName:'行舟',roles:['director','creator'],activeRole:'director'};
const models=[{id:'gpt-6.1-sol',name:'GPT-6.1-Sol',isDefault:true,efforts:['low','medium','high','xhigh','max','ultra'],defaultEffort:'low'},{id:'gpt-6-luna',name:'GPT-6-Luna',efforts:['low','high'],defaultEffort:'low'}];
const listeners=[];
window.accessQA={logout:0,routes:[],cards:[],downloads:0,installs:0,reads:0,fail:false,newModel:false,delay:false,account,models,updateFailure:false};
window.xingzhou={
 licenseCheck:async()=>mode==='update'?{status:'exempt',allowed:true}:{status:'unknown',allowed:false},
 licenseRoute:async p=>{accessQA.routes.push(p);return {status:'login',allowed:false};},
 licensePrepare:async p=>{accessQA.cards.push(p);if(p.code!=='XZ-VALID')throw Error('卡密无效，请检查后重试');},
 licenseRedeem:async()=>({status:'active',allowed:true}),
 appVersion:async()=>'2.8.126',checkUpdate:async()=>{if(accessQA.updateFailure)throw Error('暂时无法读取更新');return {currentVersion:'2.8.126',manifest:{version:mode==='update'||mode==='activate-update'?'2.8.127':'2.8.126',installerUrl:'https://example.com/setup.exe',notes:'新增本机 Codex 模型目录刷新。\n优化账号、卡密激活和软件更新界面。'}};},
 downloadUpdate:async()=>{accessQA.downloads++;listeners.forEach(fn=>fn({percent:64}));if(accessQA.delay)await new Promise(r=>accessQA.finish=r);},installUpdate:async()=>{accessQA.installs++;},
 onUpdateProgress:fn=>{listeners.push(fn);return()=>listeners.splice(listeners.indexOf(fn),1);},onLicenseState:()=>()=>{},
 authSession:async()=>mode==='app'?account:null,
 authLogout:async()=>{accessQA.logout++;if(accessQA.fail)throw Error('网络暂时不可用，请稍后重试');},authLogin:async p=>{accessQA.login=p;return account;},
 codexLocalCatalog:async()=>{accessQA.reads++;if(accessQA.delay)await new Promise(r=>accessQA.finish=r);if(accessQA.fail)throw Error('请先在本机 Codex 使用 ChatGPT 账号登录');return {models:accessQA.newModel?[...models,{id:'future-model',name:'Future Model',efforts:['medium','max'],defaultEffort:'max'}]:models,account:{email:'director@example.com',type:'chatgpt',plan:'plus'},windows:[{id:'primary',bucket:'Codex',minutes:300,usedPercent:25,resetsAt:1794038103},{id:'secondary',bucket:'Codex',minutes:10080,usedPercent:40}],checkedAt:Date.now()};},
 loadState:async()=>createInitialState(),saveState:async()=>{},loadDirectorProjects:async()=>[],saveDirectorProjects:async()=>{},storageInfo:async()=>({dataDir:'D:/qa'}),productionList:async()=>[],
 audioResultsList:async()=>[],generationList:async()=>[],collabListProjects:async()=>[],directorCollabListProjects:async()=>[],
};
const {default:App}=await import('../../src/App.jsx');
function Library(){const [state,setState]=useState(()=>({...createInitialState(),apiProfiles:[{id:'old-local',provider:'codexLocal',model:'gpt-6-luna',name:'本机 Codex · gpt-6-luna',reasoningEffort:'high',endpoint:'',requiresApiKey:false}],activeApiId:'old-local'}));accessQA.state=state;accessQA.setState=setState;return <main style={{padding:32}}><ApiLibrary state={state} setState={setState}/></main>;}
function Fixture(){if(mode==='models')return <Library/>;if(mode==='app')return <App/>;if(mode==='registration')return <RegistrationScreen requestedRole="director" initialMode="login" onClose={()=>{}} onLogin={()=>{}}/>;return <SoftwareLicenseBoundary><div style={{padding:50}}>行舟影视工作台</div></SoftwareLicenseBoundary>;}
createRoot(document.getElementById('root')).render(<Fixture/>);
