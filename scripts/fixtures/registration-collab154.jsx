import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {RegistrationScreen} from '../../src/v06/AccountAccess.jsx';
import {SoftwareLicenseBoundary} from '../../src/v06/SoftwareLicense.jsx';
import {CollabWorkspace} from '../../src/v06/CollabWorkspace.jsx';
import {ApiLibrary} from '../../src/v06/GlobalTools.jsx';
import {createInitialState} from '../../core/projectStore.js';
import './access-styles.js';
const params=new URLSearchParams(location.search),mode=params.get('mode')||'register';
const account={id:'isolated-qa',username:'qa',roles:['creator']};
window.regressionQA={register:[],login:[],recover:[],sync:[],email:[],ready:0};
window.xingzhou={
 authRegister:async p=>{regressionQA.register.push(p);if(regressionQA.fail)throw Error("Error invoking remote method 'auth-register': Error: 账号已存在");return account;},
 authLogin:async p=>{regressionQA.login.push(p);return account;},
 authRecover:async p=>{regressionQA.recover.push(p);return {username:'qa'};},
 authSendEmailCode:async p=>regressionQA.email.push(p),
 licenseCheck:async()=>({status:'prepared',allowed:false}),onLicenseState:()=>()=>{},
 appAccessStage:async()=>{},appVersion:async()=> '2.8.154',checkUpdate:async()=>null,
 collabListProjects:async p=>{regressionQA.sync.push(p);if(params.has('error'))throw Error('隔离测试：列表读取失败');return params.has('populated')?[{id:'qa-project',name:'隔离回归项目',owner_name:'QA',myRole:'collaborator',updated_at:'2026-01-01'}]:[];},
 collabIsProducer:async()=>params.has('producer'),
};
function Library(){const [state,setState]=useState({...createInitialState(),apiProfiles:[],imageApiProfiles:[],videoApiProfiles:[],audioApiProfiles:[]});return <ApiLibrary state={state} setState={setState}/>;}
function Fixture(){
 if(mode==='activation')return <SoftwareLicenseBoundary><div>isolated workspace</div></SoftwareLicenseBoundary>;
 if(mode==='collab')return <div className="app"><aside className="sidebar"/><main className="content"><div className="workspace-preserved"><CollabWorkspace state={{directorProjects:[]}} api={window.xingzhou} account={account}/></div><div id="small-probe" className="collab-empty small">small</div><div id="director-empty-probe" className="collab-empty">unscoped empty</div></main></div>;
 if(mode==='api')return <Library/>;
 return <RegistrationScreen onClose={()=>{}} onRegistered={()=>regressionQA.ready++} onLogin={()=>regressionQA.ready++}/>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
