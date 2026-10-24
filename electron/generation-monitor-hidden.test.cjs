const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('monitor continues explicitly hidden active jobs while leaving old archived results untouched',async()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../src/v06/GenerationMonitor.jsx'),'utf8').replace(/^import[^\n]*\n/gm,'').replace('export function','function');
 let effect;const monitor=new Function('useEffect','useRef','generationMediaProfiles','historicalMediaProfile','setInterval','clearInterval','window',source+';return GenerationMonitor;')(
  fn=>effect=fn,value=>({current:value}),()=>[],()=>null,()=>1,()=>{}, {addEventListener(){},removeEventListener(){}});
 const refreshed=[],api={generationList:async options=>{assert.equal(options.includeArchived,true);return[
  {id:'hidden',provider:'likeai',kind:'video',archived:true,clearedWhileActive:true,status:'submitted'},
  {id:'old',provider:'likeai',kind:'video',archived:true,status:'submitted'},
  {id:'normal',provider:'likeai',kind:'video',status:'submitted'}];},generationRefresh:async({id})=>{refreshed.push(id);return{id,status:'success'};}};
 monitor({state:{},api,account:{id:'test'}});const cleanup=effect();await new Promise(resolve=>setImmediate(resolve));cleanup();assert.deepEqual(refreshed,['hidden','normal']);
});
