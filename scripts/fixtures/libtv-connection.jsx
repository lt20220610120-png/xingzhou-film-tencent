import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Dialog} from '../../src/v06/GlobalTools.jsx';
import {LibTVConnection} from '../../src/v06/LibTVConnection.jsx';
import '../../src/styles.css';
import '../../src/canvas.css';
import '../../src/brand-theme.css';
import '../../canvas-app/workspace-controls.css';

const qa=window.libTVFixture={saved:[],testCalls:0,cancellations:0,report:null,hold:false,clipboard:''};
let settings={mode:'system',proxyUrl:''};
Object.defineProperty(navigator,'clipboard',{value:{async writeText(value){qa.clipboard=value;}}});
const api={
 async libtvStatus(){return {loggedIn:true,userName:'fixture-account-private',accountName:'fixture-team-private',ownerKey:'fixture-owner-private'};},
 async libtvAccounts(){return [];},
 async libtvProjects(){return {projects:[]};},
 async libtvNetworkSettings(){return settings;},
 async libtvSaveNetworkSettings(value){qa.saved.push(value);settings=value;return settings;},
 async libtvTestConnection(){
  qa.testCalls++;
  if(qa.hold)return new Promise(resolve=>{qa.finish=resolve;});
  return qa.report;
 },
 async libtvCancelConnectionTest(){qa.cancellations++;},
};
function Fixture(){
 const [open,setOpen]=useState(true),[state,setState]=useState({mediaProfiles:[]});
 return <>
  <button type="button" onClick={()=>setOpen(true)}>打开连接设置</button>
  <Dialog open={open} title="连接 LibTV 账号" onClose={()=>setOpen(false)}>
   {open&&<LibTVConnection state={state} setState={setState} api={api} onClose={()=>setOpen(false)}/>}
  </Dialog>
 </>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);
