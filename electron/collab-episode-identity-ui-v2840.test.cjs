const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const episodes=[{title:'第24集 A版',content:'24-1 原稿A完整对白'},{title:'第24集 B版',content:'24-1 原稿B完整对白'}];
async function withUi(run){
 const {transformWithOxc}=await import('vite'),core=await import('../core/collabEpisodes.js');
 const server={ssrLoadModule:async filename=>{
  const source=fs.readFileSync(path.join(__dirname,'..',filename),'utf8');
  const names=[...source.matchAll(/^export (?:async )?function (\w+)/gm)].map(m=>m[1]);
  const code=(await transformWithOxc(source.replace(/^import[\s\S]*?;\s*$/gm,'').replace(/export default function (\w+)/,'function $1').replace(/^export (?=(?:async )?function)/gm,''),filename,{jsx:{runtime:'classic'}})).code;
  const defaultName=source.match(/export default function (\w+)/)[1];
  const scope={React,...React,...core,Loader2:()=>null,Users:()=>null,MapPin:()=>null,Package:()=>null,getArtReviewStore:()=>({snapshot:()=>({episodes:{}})}),readCollabNavigation:()=>({}),restoredCollabEpisode:(n,eps)=>eps[0]?.episodeNumber,useScenePromptLinks:()=>({loaded:false,busy:false,links:()=>({entries:[],ids:[]})}),useWindowModel:()=>['',()=>{},null],isReviewCurrent:()=>false,artWorkflowState:()=>({mode:'automatic'}),reviewRoster:()=>[],isSceneVerified:()=>false};
  return new Function(...Object.keys(scope),code+`;return {default:${defaultName},${names.join(',')}}`)(...Object.values(scope));
 }};await run(server);
}
test('重复第24集可以进入美术核实页，渲染不再抛出集号错误',()=>withUi(async server=>{
 const {default:Review}=await server.ssrLoadModule('/src/v06/ArtReviewSection.jsx');
 assert.doesNotThrow(()=>renderToStaticMarkup(React.createElement(Review,{project:{id:'identity-render',episodes},assets:[],api:{},state:{},accountId:'mock',canEdit:false})));
}));
test('项目顶部提供完整多稿、只读权限提示和始终可查阅的历史原文',()=>withUi(async server=>{
 const {default:Panel}=await server.ssrLoadModule('/src/v06/EpisodeIdentityPanel.jsx');
 const render=project=>renderToStaticMarkup(React.createElement(Panel,{project,api:{},refresh:async()=>{}}));
 const markup=render({id:'p',episodes,myRole:'artist'});
 assert.match(markup,/原稿A完整对白/);assert.match(markup,/原稿B完整对白/);assert.match(markup,/制片/);assert.match(markup,/只读/);
 assert.doesNotMatch(markup,/<button[^>]*>选为第 24 集主稿/);
 const history=render({id:'p',myRole:'producer',episodes:[{title:'第24集',content:'24-1 当前稿',episodeIdentityHistory:[{at:'2026-10-16',reason:'select-primary',episode:episodes[1],previousProjectScript:'先前完整剧本'}]}]});
 assert.match(history,/历史版本/);assert.match(history,/原稿B完整对白/);assert.match(history,/先前完整剧本/);assert.match(history,/复制/);
}));
test('处理编号使用当前快照，保存后应用项目并手动刷新；只读和锁定不写入',()=>withUi(async server=>{
 const {resolveEpisodeIdentity}=await server.ssrLoadModule('/src/v06/EpisodeIdentityPanel.jsx');
 const calls=[],saved={id:'p',episodes:[episodes[0]]},project={id:'p',myRole:'producer',episodes};
 const api={collabResolveEpisodeIdentity:async payload=>{calls.push(payload);return saved;}};
 await resolveEpisodeIdentity({project,api,index:1,operation:'select-primary',onProjectChange:p=>calls.push(p),refresh:async options=>calls.push(options)});
 assert.deepEqual(calls,[{projectId:'p',baseEpisodes:episodes,index:1,operation:'select-primary'},saved,{manual:true}]);
 for(const blocked of [{...project,myRole:'artist'},{...project,locked:true}])await assert.rejects(resolveEpisodeIdentity({project:blocked,api,index:0,operation:'remove'}),/制片|锁定/);
 assert.equal(calls.length,3);
}));
test('全局面板在所有分区之前挂载，不另弹主稿确认框',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../src/v06/CollabWorkspace.jsx'),'utf8');
 assert.ok(/<main className="collab-stage">\s*<EpisodeIdentityPanel/.test(ui),'全部分区之前需要挂载冲突入口');
 const file=path.join(__dirname,'../src/v06/EpisodeIdentityPanel.jsx');
 assert.ok(fs.existsSync(file),'需要可操作的编号核对面板');
 assert.doesNotMatch(fs.readFileSync(file,'utf8'),/window\.confirm/);
});
