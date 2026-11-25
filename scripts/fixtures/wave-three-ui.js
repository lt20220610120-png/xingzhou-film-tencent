import { createInitialState } from '../../core/projectStore.js';
import { confirmAction, showNotice } from '../../src/components/workspace-dialog.js';
import {assetHasAdoptedImage} from '../../core/assetReferencePolicy.js';

const text = '第一集\n1-1 客厅 日 内\n甲：隔离测试。';
const account = { id: 'wave-three-isolated', username: 'qa', roles: ['creator', 'director'], isAdmin: true, activeRole: 'director' };
const ep = { id: 'qa-episode', number: 1, episodeNumber: 1, title: '第1集', content: text, script: text, prompts: [{ id: 'qa-prompt', label: '1-1-1', sceneLabel: '1-1', content: '1-1-1\n测试场面' }], scenes: [], storyboards: [] };
const director = { id: 'qa-director', name: '隔离导演剧本', masterScript: text, episodes: [ep] };
const fixture = new URLSearchParams(location.search);
if(fixture.has('long-selects'))ep.title='第1集｜隔离测试：婚礼直播、冷链基地与投资决策的完整集名测试';
const storyboard = fixture.has('storyboard-scroll') ? await import('./storyboard-scroll.js') : null;
const preferenceFixture = fixture.has('asset-reference-preference');
const shot = (label,ids) => ({label,generationConfig:{bindingAssetIds:ids}});
const secondEpisode={...ep,id:'qa-episode-2',number:2,episodeNumber:2,title:'第2集',storyboardPrompts:[shot('2-1-1',['stamp','seal'])]};
const preferenceEpisodes=[{...ep,storyboardPrompts:[shot('1-1-1',['truck','lamp','pen','archive']),shot('1-1-2',['pen'])]},secondEpisode];
const project = { id: 'qa-project', name: '隔离协作项目', owner_name: 'qa', myRole: 'producer', storageMode: 'cloud', episodes: preferenceFixture?preferenceEpisodes:storyboard?.episodes || [ep], updated_at: '2026-11-23T00:00:00Z' };
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
];
const preferenceKey='qa-fixture-reference-preference';
const readPreferenceRows=()=>JSON.parse(localStorage.getItem(preferenceKey)||JSON.stringify(preferenceRows));
function writePreferenceRows(update) {
  const rows=readPreferenceRows().map(update);
  localStorage.setItem(preferenceKey,JSON.stringify(rows));
}
qa.preferences=()=>readPreferenceRows().map(({id,noReferenceImage,adoptedImageId})=>({id,noReferenceImage:Boolean(noReferenceImage),adoptedImageId:adoptedImageId||null}));
localStorage.setItem('xz-role', 'director');
localStorage.setItem('xz-director-last-project', director.id);
localStorage.setItem('xz-director-last-pane', ep.id);
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
if(fixture.has('asset-image-delete')){
  const bridge=window.assetDeletionFixture;
  const active=await bridge.state();
  if(localStorage.getItem('qa-asset-delete-project')!==active.projectId){
    localStorage.removeItem('xz-collab-last-project');
    localStorage.setItem('qa-asset-delete-project',active.projectId);
  }
  Object.assign(answers,{appVersion:'2.8.207',collabListProjects:()=>bridge.call('listProjects'),
    collabGetProject:payload=>bridge.call('getProject',payload),collabListAssets:payload=>bridge.call('listAssets',payload),
    collabListMedia:payload=>bridge.call('listMedia',payload),collabDeleteAssetImage:payload=>bridge.call('deleteAssetImage',payload),
    collabClearAssetImages:payload=>bridge.call('clearAssetImages',payload)});
}
window.xingzhou = new Proxy({}, { get(_, key) {
  if (typeof key !== 'string' || key === 'then') return undefined;
  if (key === 'onLicenseState') return callback => {qa.licenseChanged=callback;return ()=>{qa.licenseChanged=null;};};
  if (key.startsWith('on')) return () => () => {};
  return async (...args) => {
    qa.counts[key] = (qa.counts[key] || 0) + 1;
    if (/^(?:aiChat|audioGenerate|generationSubmit|imageGenerate|videoGenerate|productionConnect)/.test(key)) {
      qa.attemptedPaid.push(key);
      throw Error('隔离环境禁止上游请求');
    }
    if (/Clear|Remove|Delete|UpdateProject|WriteProject/.test(key)) qa.operations.push(key);
    const answer = answers[key];
    return structuredClone(await (typeof answer === 'function' ? answer(...args) : answer === undefined ? [] : answer));
  };
}});
await import('../../src/main.jsx');
