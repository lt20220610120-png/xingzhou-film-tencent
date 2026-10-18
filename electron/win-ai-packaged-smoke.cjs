// Called only by the isolated package verifier; never opens real accounts/network.
module.exports=async function verifyWinAI(win){
 const assert=require('node:assert/strict');const {WebContentsView,session}=require('electron');
 const {createWinAIPanel}=require('./win-ai-panel.cjs');const {ORIGIN}=require('./win-ai-transport.cjs');
 const views=[],requests=[];let ownSession;
 class TrackedView extends WebContentsView{constructor(options){super(options);views.push(this);}}
 const panel=createWinAIPanel({getWindow:()=>win,accessService:{token:()=> 'package-fixture',session:async()=>({id:'package-fixture'})},entry:async()=>({ticket:'package-ticket'}),WebContentsView:TrackedView,session,transport:({session:s})=>{ownSession=s;return async request=>{
  requests.push({path:new URL(request.url).pathname,method:request.method});
  if(request.url===ORIGIN+'/api/win-ai/bootstrap'){
   assert.equal(request.method,'POST');assert.match(await request.text(),/ticket=package-ticket/);
   await s.cookies.set({url:ORIGIN,name:'package_identity',value:'fixture',secure:true,httpOnly:true,sameSite:'lax'});
   return new Response(null,{status:303,headers:{location:'/api/win-ai/start'}});
  }
  assert.equal(request.url,ORIGIN+'/api/win-ai/start');assert.equal(request.method,'GET');
  assert((await s.cookies.get({url:ORIGIN})).some(c=>c.name==='package_identity'&&c.httpOnly));
  return new Response('<!doctype html><title>Win AI package fixture</title><main>Win AI</main>',{headers:{'content-type':'text/html; charset=utf-8'}});
 };}});
 try{
  await panel.open({bounds:{x:0,y:0,width:800,height:500}});
  const view=views[0],state=await view.webContents.executeJavaScript('({title:document.title,node:typeof require,bridge:typeof window.xingzhou})');
  assert.equal(state.title,'Win AI package fixture');assert.equal(state.node,'undefined');assert.equal(state.bridge,'undefined');
  assert.equal(view.webContents.getLastWebPreferences().sandbox,true);
  await panel.close();assert.equal((await ownSession.cookies.get({url:ORIGIN})).length,0);
  return {bootstrapPost:true,startGet:true,sandbox:true,noPreloadBridge:true,cookiesCleared:true,requests};
 }finally{await panel.close();}
};
