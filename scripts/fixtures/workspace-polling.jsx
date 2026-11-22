import React from 'react';
import {createPortal} from 'react-dom';
import {createRoot} from 'react-dom/client';
import {WorkspaceActiveContext,WorkspacePresence} from '../../src/components/WorkspacePresence.jsx';
import {CollabWorkspace} from '../../src/v06/CollabWorkspace.jsx';
import {ProductionRunWorkspace} from '../../src/v06/ProductionRunWorkspace.jsx';

const delays=new Set([500,1000,4000,8000,10000,12000,15000,60000]),timers=new Map();
let id=1000000,hidden=false,offset=0;
const realNow=Date.now.bind(Date);
Date.now=()=>realNow()+offset;
Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
function installTimers(owner){
 const schedule=owner.setTimeout.bind(owner),cancel=owner.clearTimeout.bind(owner);
 const interval=owner.setInterval.bind(owner),clearInterval=owner.clearInterval.bind(owner);
 function add(delayed,callback,delay,args){
  if(!delays.has(delay))return (delayed?schedule:interval)(callback,delay,...args);
  timers.set(++id,{callback,delay,args,delayed,owner});return id;
 }
 owner.setTimeout=(fn,delay,...args)=>add(true,fn,delay,args);
 owner.setInterval=(fn,delay,...args)=>add(false,fn,delay,args);
 owner.clearTimeout=key=>{if(!timers.delete(key))cancel(key);};
 owner.clearInterval=key=>{if(!timers.delete(key))clearInterval(key);};
}
installTimers(window);

const calls={list:0,project:0,messages:0,connect:0,reads:0,review:0};
const project={id:'fixture-collab',owner_id:'fixture-user',owner_name:'制片',name:'模拟项目',myRole:'producer',episodes:[{id:'episode',title:'第1集',content:'1-1 客厅 日 内\n张三：你好。'}],analysis_progress:{},genre:''};
const account={id:'fixture-user'};
let pane='collab',active=true,state={apiProfiles:[],directorProjects:[]};
let run={id:'fixture-run',name:'模拟制作',config:{agentProtocol:'codex',agentModel:'fixture'},status:'paused',executorActive:false,runtimeMs:2000,episodes:[],items:[],stages:{}};
let child,childHidden=false;
const held=new Map(),hold=new Set();
function request(kind,result) {
 calls[kind]++;
 if(!hold.has(kind))return Promise.resolve(result);
 return new Promise(resolve=>held.set(kind,()=>resolve(result)));
}
const api={
 collabIsProducer:async()=>true,collabListProjects:()=>request('list',[project]),collabGetProject:()=>request('project',structuredClone(project)),
 collabListAssets:async()=>[],collabListMembers:async()=>[],collabListMessages:()=>request('messages',[]),artReviewLoadLocal:()=>request('review',{episodes:{}}),
 artReviewSaveLocal:async()=>true,analysisLoad:async()=>null,promptArtStatus:async()=>({enabled:false}),
 productionConnect:()=>request('connect',{connected:true,models:[]}),generationList:()=>request('reads',[]),
};
const ui=createRoot(document.getElementById('root'));
function render(){
 const production=<ProductionRunWorkspace run={run} runs={[run]} projects={[]} state={state} production={{}} api={api}/>;
 ui.render(<WorkspacePresence active={active}>{pane==='collab'
  ?<CollabWorkspace state={state} api={api} account={account}/>
  :production}
  {child&&createPortal(<WorkspaceActiveContext.Provider value={true}>{production}</WorkspaceActiveContext.Provider>,child.document.body)}
 </WorkspacePresence>);
}
window.pollFixture={
 calls,keys:delay=>[...timers].filter(([,timer])=>timer.delay===delay).map(([key])=>key),
 tick(delay){const entries=[...timers].filter(([,timer])=>timer.delay===delay);for(const [key,timer] of entries){if(timer.delayed)timers.delete(key);timer.callback(...timer.args);}return entries.length;},
 hidden(value){hidden=value;document.dispatchEvent(new Event('visibilitychange'));},
 childHidden(value){childHidden=value;child.document.dispatchEvent(new Event('visibilitychange'));},
 childKeys:delay=>[...timers].filter(([,timer])=>timer.owner===child&&timer.delay===delay).map(([key])=>key),
 openChild(){
  const node=document.createElement('iframe');document.body.append(node);child=node.contentWindow;
  Object.defineProperty(child.document,'hidden',{configurable:true,get:()=>childHidden});
  installTimers(child);render();
 },
 active(value){active=value;render();},
 select(value){pane=value;render();},
 edit(){state={...state,directorProjects:[{id:'updated-local',masterScript:'仍可编辑'}]};render();},
 setRun(values){run={...run,...values};render();},
 hold(kind){hold.add(kind);},
 release(kind){hold.delete(kind);held.get(kind)?.();held.delete(kind);},
 advance(ms){offset+=ms;},
 click(text){const button=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===text);if(!button)return false;button.click();return true;},
};
render();
