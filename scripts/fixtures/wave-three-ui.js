import { createInitialState } from '../../core/projectStore.js';
import { confirmAction, showNotice } from '../../src/components/workspace-dialog.js';

const text = '第一集\n1-1 客厅 日 内\n甲：隔离测试。';
const account = { id: 'wave-three-isolated', username: 'qa', roles: ['creator', 'director'], isAdmin: true, activeRole: 'director' };
const ep = { id: 'qa-episode', number: 1, episodeNumber: 1, title: '第1集', content: text, script: text, prompts: [{ id: 'qa-prompt', label: '1-1-1', sceneLabel: '1-1', content: '1-1-1\n测试场面' }], scenes: [], storyboards: [] };
const director = { id: 'qa-director', name: '隔离导演剧本', masterScript: text, episodes: [ep] };
const project = { id: 'qa-project', name: '隔离协作项目', owner_name: 'qa', myRole: 'producer', storageMode: 'cloud', episodes: [ep], updated_at: '2026-11-23T00:00:00Z' };
const profiles = Array.from({length: 30}, (_, i) => ({ id: 'mock-'+i, name: '隔离模拟模型 '+i, model: 'mock-'+i, endpoint: 'https://example.invalid/v1', apiKey: 'isolated' }));
const saved = { ...createInitialState(), apiProfiles: profiles, activeApiId: profiles[0].id, directorProjects: [director], skills: [{id:'qa-skill', name:'隔离规则', content:'测试'}] };
const jobs = Array.from({length: 120},(_,i)=>({id:'job-'+i, kind:i%2?'image':'video', status:'success', prompt:'隔离生成历史 '+i}));
jobs.push(...Array.from({length: 80},(_,i)=>({id:'image-'+i, kind:'image', status:'success', prompt:'隔离图片历史 '+i})));
const qa = window.waveThree = { counts: {}, operations: [], attemptedPaid: [], confirmAction, showNotice };
localStorage.setItem('xz-role', 'director');
localStorage.setItem('xz-director-last-project', director.id);
localStorage.setItem('xz-director-last-pane', ep.id);
const answers = {
  authSession: account, licenseCheck: {status:'active', allowed:true, authenticated:true}, onLicenseState: null, appVersion:'2.8.196',
  checkUpdate: null, storageInfo: {dataDir:'isolated',dataFile:'isolated',engine:'fixture'},
  loadState: saved, loadDirectorProjects: saved.directorProjects,
  directorCollabListProjects: [], directorQuickListRuns: [], productionList: [],
  collabListProjects: [project], collabIsProducer: true, collabGetProject: project,
  collabListAssets: [], collabListMedia: [], collabListTasks: [], collabListMembers: [], collabListMessages: [],
  collabGetPromptBinding: {versions:[], assets:[], episodes:[]}, promptArtLoad: null, promptArtStatus: null,
  adminListUsers: [], adminListInvites: [], adminWorkflowList: [],
  licenseAdmin: {grants:[], cards:[], exemptions:[], orders:[], audit:[]},
  generationList: ({includeArchived}={})=>includeArchived?[]:jobs, generationClear: {removed:1,bytesFreed:0},
  localProjectHas: false,
};
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
    return structuredClone(typeof answer === 'function' ? answer(...args) : answer === undefined ? [] : answer);
  };
}});
await import('../../src/main.jsx');
