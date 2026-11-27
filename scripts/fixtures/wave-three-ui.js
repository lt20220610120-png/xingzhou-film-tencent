import { createInitialState } from '../../core/projectStore.js';
import { confirmAction, showNotice } from '../../src/components/workspace-dialog.js';
import {assetHasAdoptedImage} from '../../core/assetReferencePolicy.js';

const text = '第一集\n1-1 客厅 日 内\n甲：隔离测试。';
const account = { id: 'wave-three-isolated', username: 'qa', roles: ['creator', 'director'], isAdmin: true, activeRole: 'director' };
const ep = { id: 'qa-episode', number: 1, episodeNumber: 1, title: '第1集', content: text, script: text, prompts: [{ id: 'qa-prompt', label: '1-1-1', sceneLabel: '1-1', content: '1-1-1\n测试场面' }], scenes: [], storyboards: [] };
const director = { id: 'qa-director', name: '隔离导演剧本', masterScript: text, episodes: [ep] };
const fixture = new URLSearchParams(location.search);
const commercialFixture = fixture.has('commercial-polish');
const draftFixture = fixture.has('jianying');
if(fixture.has('long-selects'))ep.title='第1集｜隔离测试：婚礼直播、冷链基地与投资决策的完整集名测试';
const storyboard = fixture.has('storyboard-scroll') || commercialFixture || draftFixture ? await import('./storyboard-scroll.js') : null;
const imageBatchFixture = fixture.has('asset-image-batch');
const backgroundFixture = fixture.has('art-background');
const preferenceFixture = fixture.has('asset-reference-preference')||imageBatchFixture;
const shot = (label,ids) => ({label,generationConfig:{bindingAssetIds:ids}});
const secondEpisode={...ep,id:'qa-episode-2',number:2,episodeNumber:2,title:'第2集',storyboardPrompts:[shot('2-1-1',['stamp','seal'])]};
const preferenceEpisodes=[{...ep,storyboardPrompts:[shot('1-1-1',['truck','lamp','pen','archive']),shot('1-1-2',['pen'])]},secondEpisode];
const storageMode=fixture.get('mode')==='local'?'local':'cloud';
const project = { id: 'qa-project', name: '隔离协作项目', owner_name: 'qa', myRole: fixture.has('read-only')?'collaborator':'producer', storageMode, episodes: preferenceFixture?preferenceEpisodes:storyboard?.episodes || [ep], updated_at: '2026-11-23T00:00:00Z' };
if(backgroundFixture)Object.assign(project,{style:'AI真人',script:'第一集\n1-1 码头 日 外\n'+ '工人把木箱抬到栈桥。'.repeat(1850)+'\n仓库墙上挂着一九八八年上海港装卸日历。'});
const profiles = Array.from({length: 30}, (_, i) => ({ id: 'mock-'+i, name: '隔离模拟模型 '+i, model: 'mock-'+i, endpoint: 'https://example.invalid/v1', apiKey: 'isolated' }));
if(fixture.has('long-selects'))Object.assign(profiles[0],{name:'测试 Fast DeepSeek-V4.1-Flash',model:'cn:deepseek-v4.1-flash-'+ 'extended-production-context-'.repeat(8)});
const saved = { ...createInitialState(), apiProfiles: profiles, activeApiId: profiles[0].id, directorProjects: [director], skills: [{id:'qa-skill', name:'隔离规则', content:'测试'}] };
const jobs = Array.from({length: 120},(_,i)=>({id:'job-'+i, kind:i%2?'image':'video', status:'success', prompt:'隔离生成历史 '+i}));
jobs.push(...Array.from({length: 80},(_,i)=>({id:'image-'+i, kind:'image', status:'success', prompt:'隔离图片历史 '+i})));
const qa = window.waveThree = { counts: {}, operations: [], attemptedPaid: [], confirmAction, showNotice };
const sampleImage={id:'fixture-image',url:'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E'};
const prop = (id,name,episode,extra={}) => ({id,name,category:'prop',first_episode:episode,episodes:[episode],sceneIds:[episode+'-1'],description:'隔离道具',...extra});
const adopted={adoptedImageId:sampleImage.id,image_url:sampleImage.url,images:[sampleImage]};
const preferenceRows=[
  prop('truck','冷链重卡',1),prop('lamp','台灯',1,adopted),prop('pen','随身钢笔',1),
  prop('archive','旧钱包',1,{images:[sampleImage],adoptedImageId:null,noReferenceImage:true}),
  prop('stamp','印章',2),prop('seal','印泥',2),
  {...prop('day','【李岚-便服】',1,adopted),category:'character'},
  {...prop('night','【李岚-工装】',1),category:'character'},
  {...prop('studio','【影棚-内】',1,adopted),category:'scene'},
  {...prop('studio-night','【影棚-夜-内】',1),category:'scene'},
  {...prop('person','【林安-常服】',1,adopted),category:'character'},
];
if(imageBatchFixture){
  preferenceRows.push(...Array.from({length:10},(_,i)=>prop('group-'+i,'模拟道具 '+i,1)));
  preferenceRows.push(prop('episode-only','单集测试道具',2,{noReferenceImage:true}));
  Object.assign(preferenceRows.find(asset=>asset.id==='day'),{images:[],image_url:'',adoptedImageId:null});
  Object.assign(saved,{mediaProfiles:[{id:'qa-image',kind:'image',name:'隔离模拟生图',model:'qa-image',endpoint:'https://example.invalid/v1',apiKey:'isolated'}],activeImageApiId:'qa-image'});
}
const preferenceKey='qa-fixture-reference-preference:'+storageMode+(imageBatchFixture?':batch':'');
const readPreferenceRows=()=>JSON.parse(localStorage.getItem(preferenceKey)||JSON.stringify(preferenceRows));
function writePreferenceRows(update) {
  const rows=readPreferenceRows().map(update);
  localStorage.setItem(preferenceKey,JSON.stringify(rows));
}
qa.preferences=()=>readPreferenceRows().map(({id,noReferenceImage,adoptedImageId})=>({id,noReferenceImage:Boolean(noReferenceImage),adoptedImageId:adoptedImageId||null}));
localStorage.setItem('xz-role', 'director');
localStorage.setItem(`xz-director-last-project:${account.id}`, director.id);
localStorage.setItem(`xz-director-last-pane:${account.id}`, ep.id);
const answers = {
  authSession: account, licenseCheck: {status:'active', allowed:true, authenticated:true}, onLicenseState: null, appVersion:'2.8.196',
  checkUpdate: null, storageInfo: {dataDir:'isolated',dataFile:'isolated',engine:'fixture'},
  loadState: saved, loadDirectorProjects: saved.directorProjects,
  directorCollabListProjects: [], directorQuickListRuns: [], productionList: [],
  collabListProjects: [project], collabIsProducer: true, collabGetProject: project,
  collabListAssets: [], collabListMedia: storyboard?.media || [], collabListTasks: [], collabListMembers: [], collabListMessages: [],
  collabGetPromptBinding: {versions:[], assets:[], episodes:[]}, promptArtLoad: null, promptArtStatus: null,
  adminListUsers: [], adminListInvites: [], adminWorkflowList: [],
  licenseAdmin: {grants:[], cards:[], exemptions:[], orders:[], audit:[]},
  generationList: ({includeArchived}={})=>includeArchived?[]:jobs, generationClear: {removed:1,bytesFreed:0},
  localProjectHas: false,
};
if(preferenceFixture)Object.assign(answers,{
  collabListAssets:readPreferenceRows,
  artReviewLoadLocal:{episodes:{}},
  collabSetAssetReferenceImagePreference:({assetIds,noReferenceImage})=>{
    const updatedIds=[],skippedIds=[];
    qa.operations.push({assetIds,noReferenceImage});
    writePreferenceRows(row=>{
      if(!assetIds.includes(row.id))return row;
      if(noReferenceImage&&assetHasAdoptedImage(row)){skippedIds.push(row.id);return row;}
      updatedIds.push(row.id);return {...row,noReferenceImage};
    });
    return {updatedIds,skippedIds};
  },
  collabUpdateAsset:({assetId,updates})=>{
    writePreferenceRows(row=>row.id===assetId?{...row,...updates,image_url:row.images.find(image=>image.id===updates.adoptedImageId).url,noReferenceImage:false}:row);
  },
});
if(imageBatchFixture){
  const releases=new Map();
  const albums=[];
  const otherProject={...project,id:'qa-second-project',name:'第二个隔离项目',episodes:[ep]};
  qa.imageRequests=[];
  qa.savedImages=albums;
  qa.releaseImage=id=>{const release=releases.get(id);if(!release)return false;releases.delete(id);release();return true;};
  qa.pendingImages=()=>[...releases.keys()];
  Object.assign(answers,{
    collabListProjects:[project,otherProject],
    collabGetProject:({projectId})=>projectId===project.id?project:otherProject,
    collabListAssets:({projectId})=>projectId===project.id?readPreferenceRows():[],
    mediaGenerateImage:async ({assetId,projectId,references})=>{
      qa.imageRequests.push({assetId,projectId,references});
      await new Promise(resolve=>releases.set(assetId,resolve));
      if(qa.failImage===assetId)throw Error('隔离模拟：接口返回 503');
      return {filePath:'C:/isolated/'+assetId+'.png'};
    },
    collabAttachGeneratedAssetImage:({projectId,assetId,filePath})=>{
      if(projectId!==project.id||filePath!=='C:/isolated/'+assetId+'.png')throw Error('隔离结果关联错误');
      const image={...sampleImage,id:'saved-'+assetId,url:sampleImage.url+'#'+assetId};
      writePreferenceRows(row=>row.id===assetId?{...row,noReferenceImage:false,images:[...row.images||[],image],image_url:image.url,adoptedImageId:image.id}:row);
      albums.push(assetId);
      return image;
    },
  });
}
if(backgroundFixture){
  let checkpoint={episodes:{}};
  qa.backgroundCalls=[];
  qa.backgroundCheckpoint=()=>checkpoint;
  qa.backgroundMode='fail';
  Object.assign(answers,{
    artReviewLoadLocal:()=>checkpoint,
    artReviewSaveLocal:({data})=>{checkpoint=structuredClone(data);},
    collabUpdateProject:({updates})=>Object.assign(project,updates),
    aiChat:p=>{
      if(!p.artBackground)return {ok:false,error:'隔离验收：下游美术分析调用已拦截。'};
      const input=JSON.parse(p.messages[1].content);
      qa.backgroundCalls.push({input,correction:p.messages[0].content.includes('纠偏')});
      if(qa.backgroundMode==='fail')return {ok:false,error:'模拟背景服务 503'};
      if(input.untrustedScript)return JSON.stringify(input.untrustedScript.includes('一九八八年')?{era:'1988 年上海港，依据装卸日历'}:{background:'码头工人搬运木箱'});
      return JSON.stringify({background:'上海港码头工人',era:'1988 年上海港',tone:'港口劳动纪实'});
    },
  });
}
if(commercialFixture){
  const voice = name => ({manual:{name,characterName:name,sceneIds:['1-1'],quote:'隔离样音。'}});
  const sample = {id:'qa-sample',kind:'audio',name:'隔离样音',url:'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='};
  const poolJobs = ['success','submitted','failed'].map((status,index)=>({
    id:`qa-pool-${index}`,projectId:project.id,shotId:`scroll-1-1-${index+1}`,kind:'video',status,
  }));
  const mediaProfiles = ['image','video'].map(kind=>({
    id:`qa-${kind}`,kind,name:'隔离模拟生成接口',model:`qa-${kind}-model`,endpoint:'https://example.invalid/v1',apiKey:'isolated',
  }));
  Object.assign(saved,{mediaProfiles,activeImageApiId:'qa-image',activeVideoApiId:'qa-video'});
  Object.assign(answers,{
    collabListAssets:preferenceRows,
    artReviewLoadLocal:{episodes:{},voiceProfiles:{
      'qa-empty':voice('甲'),
      'qa-candidate':{...voice('乙'),candidates:[sample]},
      'qa-confirmed':{...voice('丙'),confirmed:sample,candidates:[sample]},
    }},
    generationList:({includeArchived}={})=>includeArchived?poolJobs:jobs,
  });
}
if(draftFixture){
  const draftJobs = [
    {id:'older-local',shotId:'scroll-1-1-1',createdAt:'2026-01-01T00:00:00Z'},
    {id:'newer-local',shotId:'scroll-1-1-1',createdAt:'2026-01-02T00:00:00Z'},
    {id:'different-episode',shotId:'scroll-2-1-1',createdAt:'2026-01-01T00:00:00Z'},
  ].map(row=>({...row,projectId:project.id,kind:'video',status:'success'}));
  qa.draftRequests=[];
  Object.assign(answers,{
    generationList:()=>draftJobs,
    projectJianyingDraft:request=>{
      qa.draftRequests.push(request);
      if(qa.cancelDraft)return null;
      if(qa.failDraft)throw Error('隔离目录不可写');
      return {folder:'C:/隔离资料/测试剪映草稿',shots:1,voices:1,skipped:['1-1-2 视频尚未生成'],voiceNotes:['1-1-1 配音超出镜头，已按镜头长度截取']};
    },
  });
}
if(fixture.has('asset-image-delete')){
  const bridge=window.assetDeletionFixture;
  const active=await bridge.state();
  if(localStorage.getItem('qa-asset-delete-project')!==active.projectId){
    localStorage.removeItem(`xz-collab-last-project:${account.id}`);
    localStorage.setItem('qa-asset-delete-project',active.projectId);
  }
  Object.assign(answers,{appVersion:'2.8.207',collabListProjects:()=>bridge.call('listProjects'),
    collabGetProject:payload=>bridge.call('getProject',payload),collabListAssets:payload=>bridge.call('listAssets',payload),
    collabListMedia:payload=>bridge.call('listMedia',payload),collabDeleteAssetImage:payload=>bridge.call('deleteAssetImage',payload),
    collabClearAssetImages:payload=>bridge.call('clearAssetImages',payload)});
}
if(fixture.has('storyboard-duration209')){
  const bridge=window.storyboard209Fixture;
  const active=await bridge.bootstrap();
  Object.assign(saved,{directorProjects:[active.director],mediaProfiles:active.profiles,activeVideoApiId:active.profiles[0].id});
  localStorage.setItem(`xz-director-last-project:${account.id}`,active.director.id);
  localStorage.setItem(`xz-director-last-pane:${account.id}`,active.director.episodes[0].id);
  Object.assign(answers,{
    appVersion:'2.8.209',loadDirectorProjects:saved.directorProjects,
    collabListProjects:()=>bridge.call('listProjects'),collabGetProject:p=>bridge.call('getProject',p),
    collabUpdateProject:p=>bridge.call('updateProject',p),collabPatchStoryboard:p=>bridge.call('patchStoryboard',p),
    promptArtStatus:{enabled:false},artReviewLoadLocal:{episodes:{}},
    storyboardBatchStart:p=>bridge.call('start',p),storyboardBatchList:p=>bridge.call('list',p),
  });
}
const enumerableBridge = Object.fromEntries([
  ...Object.keys(answers),
  'saveState', 'saveDirectorProjects', 'licenseRoute', 'licenseHeartbeat', 'onGenerationJobs',
  'onGenerationMonitor', 'onAssetPreview', 'onUpdateProgress', 'onMediaTaskStatus',
  'aiChat', 'audioGenerate', 'generationSubmit', 'imageGenerate', 'videoGenerate', 'productionConnect',
  'storyboardBatchStart', 'storyboardBatchResume', 'projectVideoShare',
].map(key=>[key,true]));
window.xingzhou = new Proxy(enumerableBridge, { get(_, key) {
  if (typeof key !== 'string' || key === 'then') return undefined;
  if (key === 'onLicenseState') return callback => {qa.licenseChanged=callback;return ()=>{qa.licenseChanged=null;};};
  if (key.startsWith('on')) return () => () => {};
  return async (...args) => {
    qa.counts[key] = (qa.counts[key] || 0) + 1;
    if (/^(?:audioGenerate|generationSubmit|imageGenerate|videoGenerate|productionConnect)/.test(key) ||
        key==='aiChat'&&!backgroundFixture ||
        key==='mediaGenerateImage'&&!imageBatchFixture ||
        commercialFixture&&/^(?:generate|storyboardBatchStart|storyboardBatchResume|projectVideoShare)/i.test(key)) {
      qa.attemptedPaid.push(key);
      throw Error('隔离环境禁止上游请求');
    }
    if (/Clear|Remove|Delete|UpdateProject|WriteProject/.test(key)) qa.operations.push(key);
    const answer = answers[key];
    return structuredClone(await (typeof answer === 'function' ? answer(...args) : answer === undefined ? [] : answer));
  };
}});
await import('../../src/main.jsx');
