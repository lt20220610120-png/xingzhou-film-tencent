// Public metadata only. The original Skill documents and attachments live outside the installer.
import {upgradeLegacyFtConnections} from './ftUpgrade.js';
export const PROTECTED_DIRECTOR_SKILLS=Object.freeze([
 {id:'builtin:video-prompt-fast-v8-2',name:'video-prompt-fast-v8-2',description:'快速模式，用户用括号分段，独立输出提示词。'},
 {id:'builtin:video-prompt-vertical-creator-v2',name:'video-prompt-vertical-creator-v2',description:'将用户的导演思维转换为基础设定的竖屏视频提示词。'},
 {id:'builtin:video-prompt-horizontal-creator',name:'video-prompt-horizontal-creator',description:'将用户的导演思维转换为基础的横屏提示词。'},
].map(skill=>Object.freeze({...skill,type:'builtin',importMethod:'protected-server',protected:true})));
export const isProtectedSkill=skill=>skill?.importMethod==='protected-server'&&PROTECTED_DIRECTOR_SKILLS.some(s=>s.id===skill.id);
export const cleanClient=state=>state?.clientEdition==='clean-v1';
export function protectedProfileIssue(profile){
 try{
  const u=new URL(profile?.endpoint),routes={'https://api.openai.com':['/v1'],'https://api.deepseek.com':['','/v1'],'https://api.anthropic.com':['/v1'],'https://winai.xingzhoufilm.cn':['/v1']};
  const route=u.pathname.replace(/\/+$/,'').replace(/\/(chat\/completions|responses|messages)$/,'');
  if(!routes[u.origin]?.includes(route)||u.username||u.password||u.search||u.hash||!profile.apiKey?.trim())throw Error();
  return '';
 }catch{return '自带Skill仅支持已审核的官方 OpenAI、DeepSeek、Anthropic 或行舟 Win AI 公网API。请配置对应地址和Key；其他线路需审核。本机、网页登录与已有自定义Skill的使用方式保持原样。';}
}
export function initializeClientDistribution(state,{fresh=false}={}){
 if(!fresh)return upgradeLegacyFtConnections(state);
 if(state.clientEdition)return state;
 if(['skills','directorProjects','fruitProjects','scriptProjects','apiProfiles','mediaProfiles','canvases','chatSessions','scriptLibrary'].some(key=>state[key]?.length))return state;
 return {...state,clientEdition:'clean-v1',skills:PROTECTED_DIRECTOR_SKILLS.map(s=>({...s}))};
}
