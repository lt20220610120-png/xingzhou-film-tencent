import React from 'react';
import {createRoot} from 'react-dom/client';
import {SoftwareLicenseBoundary} from '../../src/v06/SoftwareLicense.jsx';
import './access-styles.js';
const params=new URLSearchParams(location.search),mode=params.get('mode')||'fresh',available=params.get('update')==='1',next=params.get('next')||'2.8.128';
let prepared=false,account=mode==='logged'?{id:'test',roles:['director'],activeRole:'director'}:null;
const listeners=new Set(),stateListeners=new Set();
window.startupQA={stages:[],cards:[],login:[],register:[],downloads:0,installs:0,delay:false,checkError:false,revoked:false};
window.xingzhou={
 appAccessStage:async stage=>startupQA.stages.push(stage),closeAccessWindow:async()=>{},appVersion:async()=>'2.8.127',
 licenseCheck:async()=>{if(startupQA.checkError)throw Error('无法连接授权服务');return startupQA.revoked?{status:'revoked',allowed:false}:account?{status:'active',allowed:true,authenticated:true}:mode==='known'?{status:'active',allowed:true,authenticated:false}:prepared?{status:'prepared',allowed:false,authenticated:false}:{status:'required',allowed:false,authenticated:false};},
 licensePrepare:async p=>{startupQA.cards.push(p);if(p.code!=='XZ-VALID')throw Error('卡密无效、已停用或已兑换');prepared=true;},licenseRedeem:async()=>({status:'active',allowed:true,authenticated:true}),authSession:async()=>account,
 authLogin:async p=>{startupQA.login.push(p);if(p.password==='wrong')throw Error('账号或密码错误');account={id:'test',roles:['director'],activeRole:'director'};return account;},
 authRegister:async p=>{startupQA.register.push(p);account={id:'test',roles:[p.inviteCode==='CREATOR'?'creator':'director'],activeRole:p.inviteCode==='CREATOR'?'creator':'director'};return account;},
 authSendEmailCode:async()=>{},authRecover:async()=>({username:'test'}),
 onLicenseState:fn=>{stateListeners.add(fn);return()=>stateListeners.delete(fn);},
 checkUpdate:async()=>({currentVersion:'2.8.127',manifest:{version:available?next:'2.8.127',installerUrl:'https://example.invalid/update.exe',notes:'优化软件体验。\n修复已知问题。'}}),
 downloadUpdate:async()=>{startupQA.downloads++;listeners.forEach(fn=>fn({percent:64}));if(startupQA.delay)await new Promise(resolve=>startupQA.finish=resolve);},installUpdate:async()=>{startupQA.installs++;},
 onUpdateProgress:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
};
startupQA.pushState=next=>stateListeners.forEach(fn=>fn(next));
startupQA.revoke=()=>{startupQA.revoked=true;stateListeners.forEach(fn=>fn({status:'revoked',allowed:false}));};
createRoot(document.getElementById('root')).render(<SoftwareLicenseBoundary><div aria-label="工作台">进入工作台</div><button onClick={()=>window.dispatchEvent(new CustomEvent('xingzhou-check-update'))}>手动检查更新</button></SoftwareLicenseBoundary>);
