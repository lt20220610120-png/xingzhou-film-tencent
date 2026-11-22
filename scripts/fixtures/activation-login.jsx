import React from 'react';
import { createRoot } from 'react-dom/client';
import { SoftwareLicenseBoundary } from '../../src/v06/SoftwareLicense.jsx';
import '../../src/account-access.css';
import '../../src/access-experience.css';

const required = { status:'required', allowed:false, authenticated:false };
const account = { id:'isolated-account', username:'existing', roles:['director'] };
const listeners = new Set();
const deferred = () => {
 let resolve, reject;
 const pending = new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {pending,resolve,reject};
};
let check = deferred(), login = null, session = null, state = required;
const qa = window.activationFixture = {
 calls:[], stages:[],
 finishStartup() {const pending=check;check=null;pending.resolve(required);},
 failStartup() {const pending=check;check=null;pending.reject(Error('网络暂不可用'));},
 holdCheck() {check=deferred();},
 finishCheck(next) {const pending=check;check=null;pending.resolve(next);},
 holdLogin() {login=deferred();},
 finishLogin() {const pending=login;login=null;pending.resolve();},
 publish(next) {state=next;for(const listener of listeners)listener(next);},
 fill(selector,value) {
  const input=document.querySelector(selector);
  const setValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  setValue.call(input,value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
 },
};
window.xingzhou = {
 async licenseCheck() {qa.calls.push('check');return check?check.pending:state;},
 async licensePrepare({code}) {
  if(code!=='fixture-card')throw Error('无效卡密');
  qa.calls.push('prepare');
  qa.publish({status:'prepared',allowed:false,authenticated:false});
 },
 async authSession() {return session;},
 async authLogin({username,password}) {
  qa.calls.push('login:'+username);
  if(login)await login.pending;
  if(username==='monthly')throw Error('新用户请先输入卡密激活设备');
  if(username!=='existing'||password!=='fixture-password')throw Error('账号或密码错误');
  session=account;
  return account;
 },
 onLicenseState(listener) {listeners.add(listener);return ()=>listeners.delete(listener);},
 async appAccessStage(stage) {qa.stages.push(stage);},
 async closeAccessWindow() {qa.calls.push('close');},
};
createRoot(document.getElementById('root')).render(
 <React.StrictMode>
  <SoftwareLicenseBoundary><div id="workspace">已进入工作台</div></SoftwareLicenseBoundary>
 </React.StrictMode>,
);
