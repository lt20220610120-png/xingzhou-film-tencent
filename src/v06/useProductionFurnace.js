import {useEffect,useRef,useState} from 'react';
import {createProductionController} from '../../core/productionFurnace.js';
import {createProductionAdapters} from './productionAdapters.js';
export function useProductionFurnace({api,account,stateRef,setState,quickGeneration}){
 const [,render]=useState(0),latest=useRef();latest.current={account,quickGeneration};const holder=useRef(null);
 if(account?.isAdmin&&holder.current?.accountId!==account.id){const owner=account.id;
  const assert=()=>{if(latest.current.account?.id!==owner||!latest.current.account?.isAdmin)throw Error('管理员已切换');};
  const adapters=createProductionAdapters({api,getState:()=>{assert();return stateRef.current;},setState:fn=>{assert();setState(fn);},getQuick:()=>{assert();return latest.current.quickGeneration;},getAccount:()=>{assert();return latest.current.account;}});
  const controller=createProductionController({load:()=>{assert();return api.productionList();},save:run=>{assert();run.accountId=owner;return api.productionSave(run);},adapters,onChange:()=>render(n=>n+1)});
  holder.current={accountId:owner,controller};
 }
 useEffect(()=>{const control=holder.current?.controller;if(!account?.isAdmin||!api.onProductionAgentTool)return;return api.onProductionAgentTool(async request=>{try{const result=await control.agentTool(request.runId,request.name,request.args);await api.productionAgentToolResult({id:request.id,runId:request.runId,result});}catch(error){await api.productionAgentToolResult({id:request.id,runId:request.runId,error:error.message}).catch(()=>{});}});},[account?.id,account?.isAdmin]);
 useEffect(()=>{const control=holder.current?.controller;if(!account?.isAdmin||!api.onProductionChatDelta)return;return api.onProductionChatDelta(({runId,delta,progress,meta})=>{void control?.chatDelta(runId,delta,progress,meta);});},[account?.id,account?.isAdmin]);
 useEffect(()=>{const control=holder.current?.controller;if(account?.isAdmin&&api.productionList)void control?.restore().catch(()=>{});return()=>{void control?.pauseAll().catch(()=>{});};},[account?.id,account?.isAdmin]);
 return account?.isAdmin?holder.current?.controller:null;
}
