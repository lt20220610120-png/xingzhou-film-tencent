const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../browser-extension/like-connector/main.js'),'utf8');
function fixture(){
 const canvas='b'.repeat(24),project='https://likeai.pro/projects/'+'a'.repeat(24),ref=value=>({__v_isRef:true,value});
 const select=(value,marked=false)=>({component:{type:{name:'ElSelect'},props:{modelValue:value},vnode:{props:{class:marked?'wb-snapshot-select':'node-model-select'}},setupState:{selectedLabel:ref(marked?'目标画布':'模型')}}});
 const toolbar=select(canvas,true),graph={nodes:ref([]),selectedNodeId:ref('')};
 const contexts={app:{projectId:ref('a'.repeat(24)),isReadonly:ref(false)},models:{videoModels:ref([{value:'doubao_seedance_2_5'}])},graph};
 const wb={type:{__name:'Workbench'},provides:Object.fromEntries(Object.entries(contexts).map(([k,v])=>[Symbol('workbench-'+k+'-context'),v])),subTree:{children:[toolbar]}};
 const listeners=[],pending=new Map();let seq=0;
 const window={addEventListener:(_type,fn)=>listeners.push(fn),postMessage:m=>{if(m.type==='response')pending.get(m.id)?.(m);}};
 vm.runInNewContext(source,{window,document:{querySelector:()=>({__vue_app__:{_container:{_vnode:{component:wb}}}})},location:{origin:'https://likeai.pro',pathname:'/projects/'+'a'.repeat(24)},crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,File,atob});
 const ask=(type,data)=>new Promise(resolve=>{const id=String(++seq);pending.set(id,resolve);listeners[0]({source:window,origin:'https://likeai.pro',data:{source:'xz-like-isolated',type,data,id}});});
 return {canvas,project,toolbar,wb,contexts,graph,select,ask};
}
test('Like canvas identity survives node selection and newly mounted model/parameter selectors',async()=>{
 const f=fixture();assert.equal((await f.ask('inspect')).result.canvasId,f.canvas);
 f.wb.subTree.children.unshift(f.select('doubao_seedance_2_5'),f.select('480p'));
 assert.equal((await f.ask('inspect')).result.canvasId,f.canvas);
 const result=await f.ask('command',{id:'query',op:'taskStatus',projectUrl:f.project,canvasId:f.canvas,jobId:'missing'});
 assert.equal(result.ok,true);assert.equal(result.result.status,'uncertain');
});
test('Like adapter rejects missing/ambiguous canvas and actual canvas/project/permission changes',async()=>{
 const f=fixture(),command={id:'query',op:'taskStatus',projectUrl:f.project,canvasId:f.canvas,jobId:'missing'};
 f.wb.subTree.children=[f.select('doubao_seedance_2_5')];assert.equal((await f.ask('inspect')).ok,false);
 f.wb.subTree.children=[f.toolbar,f.select('c'.repeat(24),true)];assert.equal((await f.ask('inspect')).ok,false);
 f.wb.subTree.children=[f.toolbar];f.toolbar.component.props.modelValue='c'.repeat(24);assert.equal((await f.ask('command',command)).ok,false);
 f.toolbar.component.props.modelValue=f.canvas;f.contexts.app.isReadonly.value=true;assert.equal((await f.ask('command',command)).ok,false);
 f.contexts.app.isReadonly.value=false;assert.equal((await f.ask('command',{...command,projectUrl:f.project.replace(/a/g,'d')})).ok,false);
});
