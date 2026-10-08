import React,{useEffect,useMemo,useRef,useState} from 'react';
import {WorldSimulationWorkbench} from './WorldSimulationWorkbench.jsx';
import {ArrowLeft,Save,Download,Sparkles,History,Layers,FolderOpen,Check,BookOpen} from 'lucide-react';
import {normalizeFrameworkProject,frameworkRows,applyFrameworkCommand} from '../../core/frameworkWorkflow.js';
import {frameworkModelSelection,frameworkModelConfig} from '../../core/frameworkModels.js';
import {useMovablePanel} from './useMovablePanel.js';
import './movable-panel.css';
import {creatorModelOptions} from '../../core/creatorAi.js';
import {ExportDialog} from './CreatorDialogs.jsx';
import {IdeasPane,SettingsPane} from './framework/IdeaSettingsPanes.jsx';

import {EventsPane,MainlinePane,SmallEventsPane,MasterPane} from './framework/ComponentPanes.jsx';
import {ReferencesPane,SimulationPane} from './framework/ReferencePanes.jsx';
import {PlansPane,ScriptPane,HistoryPane} from './framework/PlanScriptPanes.jsx';
import {FrameworkAgent,FrameworkRecordDialog,taskLabels} from './framework/FrameworkAgent.jsx';
import {Tag,FrameworkDraftContext,FrameworkModelContext} from './framework/FrameworkParts.jsx';
import './framework/framework.css';
import './framework/components.css';
import './framework/card-workspace.css';

const stages=[['ideas','灵感'],['settings','设定'],['events','大事件'],['mainline','主线'],['smallEvents','小事件'],['plans','集纲'],['script','正文']];
export function FrameworkCreationWorkspace({project:rawProject,state,setState,getState,api,agent,onBack,onSave,saveStatus}){
 const project=useMemo(()=>normalizeFrameworkProject(rawProject),[rawProject]),f=project.creator.framework,rows=useMemo(()=>frameworkRows(f),[f]);
 const [stage,setStage]=useState(f.groups.length?'events':'ideas'),[collapsed,setCollapsed]=useState(false),[agentOpen,setAgentOpen]=useState(false),[error,setError]=useState(''),[recordId,setRecordId]=useState(''),[exportMode,setExportMode]=useState(''),[simulationRequest,setSimulationRequest]=useState(null);
 const [episodeSelection,setEpisodeSelection]=useState({});
 const options=creatorModelOptions(state.apiProfiles||[],state.activeApiId),saved=project.creator.runConfig?.framework||{};
 const [skillId,setSkillIdLocal]=useState(saved.skillId||''),[scope,setScopeLocal]=useState(saved.scope||'project');
 const latest=useRef(state);latest.current=state;
 const currentState=()=>getState?.()||latest.current;
 const currentProject=()=>currentState().scriptProjects?.find(p=>p.id===project.id);
 const simulationPanel=useMovablePanel(`xz-panel:${project.id}:simulation`,'模拟助手',!!simulationRequest&&!recordId&&!agentOpen);
 const selection=frameworkModelSelection(saved,options,stage);
 const selectionKey=purpose=>purpose?`${stage}:${purpose}`:stage;
 const selectionFor=purpose=>frameworkModelSelection(saved,options,selectionKey(purpose));
 useEffect(()=>{setSimulationRequest(null);},[stage]);
 const openSimulation=request=>{setSimulationRequest(request);setAgentOpen(false);setRecordId('');};
 const command=c=>{setError('');try{const current=currentProject();if(!current)throw new Error('项目已移除，请返回项目列表。');const updated=applyFrameworkCommand(current,c);setState(previous=>{try{return {...previous,scriptProjects:previous.scriptProjects.map(p=>p.id===project.id?(p===current?updated:applyFrameworkCommand(p,c)):p)};}catch(e){setError(e.message);return previous;}});return true;}catch(e){setError(e.message);return false;}};
 const config=patch=>{const existing=currentProject()?.creator?.runConfig||{};command({type:'creator.config',patch:{runConfig:{...existing,framework:{...existing.framework,skillId,scope,...patch}}}});};
 const selectModel=(purpose,value)=>{const existing=currentProject()?.creator?.runConfig?.framework||{};config(frameworkModelConfig(existing,selectionKey(purpose),value));};
 const setSelection=value=>selectModel('',value),setSkillId=value=>{setSkillIdLocal(value);config({skillId:value});},setScope=value=>{setScopeLocal(value);config({scope:value});};
 const run=async(target,instruction='')=>{setError('');const liveOptions=creatorModelOptions(currentState().apiProfiles||[],currentState().activeApiId),liveConfig=currentProject()?.creator?.runConfig?.framework||{},selected=frameworkModelSelection(liveConfig,liveOptions,selectionKey(target.task==='frameworkSimulate'?'simulation':'')),profile=liveOptions.find(o=>o.selectionId===selected);try{if(!profile){setAgentOpen(true);throw new Error('请先在 API 接口配置可用模型。');}const id=await agent.run({kind:'script',projectId:project.id,target,instruction:instruction||taskLabels[target.task]||'围绕当前作品协同创作',profile,skillId,scope,chat:target.task==='frameworkChat'});if(target.task!=='frameworkEpisode'){if(target.task==='frameworkChat')setAgentOpen(true);else {setAgentOpen(false);setRecordId(id);}}return id;}catch(e){setError(e.message);if(e.code!=='FRAMEWORK_EPISODE_FORMAT')setAgentOpen(true);return null;}};
 const activity=Object.entries(agent.activity||{}).find(([key,a])=>key.startsWith(`script:${project.id}`)&&a.running)?.[1]||{},busy=!!activity.running;
 const records=project.creator.records||[],review=id=>{setAgentOpen(false);setRecordId(id);},common={project,state,setState,getState:currentState,api,agent,f,rows,command,run,busy,onError:setError,navigate:next=>{if(next==='world')setSimulationRequest(null);setStage(next);},records,review,openSimulation,simulationRequest,episodeSelection,setEpisodeSelection};
 const record=records.find(r=>r.id===recordId);
 return <FrameworkModelContext.Provider value={{options,selectionFor,select:selectModel}}><FrameworkDraftContext.Provider value={`${project.id}:${stage}`}><div className={`fw-workspace ${collapsed?'fw-nav-collapsed':''}`}>
 <nav className="fw-directory" aria-label="原创框架式创作目录"><button className="ghost fw-back" onClick={onBack}><ArrowLeft size={15}/>全部原创项目</button><div className="fw-project-title"><strong>{project.name}</strong><small>原创 · 框架式创作</small></div><button className={`fw-nav-button ${stage==='master'?'active':''}`} onClick={()=>setStage('master')}><BookOpen size={16}/>总剧本</button><button className={`fw-nav-button ${stage==='references'?'active':''}`} onClick={()=>setStage('references')}><Layers size={16}/>对标剧本</button><span className="fw-nav-label">框架式创作</span>{stages.map(([key,label],i)=><button key={key} className={`fw-nav-button ${stage===key?'active':''}`} onClick={()=>setStage(key)}><span className="fw-step-number">{i+1}</span>{label}{(key==='ideas'&&!!f.ideaSummary.trim()||key==='settings'&&f.settings.confirmed&&!f.settings.pending.length||key==='mainline'&&f.mainline.orderConfirmed)&&<Check size={12}/>}</button>)}<span className="fw-nav-label">辅助创作</span>{[['world','大世界模拟项目',Sparkles],['history','项目版本',History]].map(([key,label,Icon])=><button key={key} className={`fw-nav-button ${stage===key?'active':''}`} onClick={()=>{if(key==='world')setSimulationRequest(null);setStage(key);}}><Icon size={15}/>{label}</button>)}<div className="fw-progress"><strong>故事组成</strong><p>{f.groups.length} 个大事件 · {rows.length} 个小事件</p><p>{f.settings.confirmed?'设定已确认':'设定待确认'} · {f.mainline.links.filter(l=>l.stale||!l.confirmed).length} 处衔接待复核</p><small>调整事件顺序，已有引用会保留。</small></div></nav>
 <main className="fw-main"><header className="fw-topbar"><button className="ghost" aria-label="折叠项目目录" onClick={()=>setCollapsed(!collapsed)}><FolderOpen size={17}/></button><div className="fw-breadcrumb"><span>原创</span><span>›</span><strong>框架式创作</strong></div><span className="fw-save-status">{saveStatus?.error?'保存失败，请重试':saveStatus?.saving?'正在保存…':saveStatus?.saved?'已保存到本地':'自动保存中'}</span><button className="secondary" onClick={()=>onSave?.()}><Save size={15}/>保存</button><button className="secondary" aria-label="写作 Agent" onClick={()=>setAgentOpen(!agentOpen)}><Sparkles size={15}/>写作 Agent{records.some(r=>r.status==='pending'&&!['frameworkChat','frameworkCheck'].includes(r.target?.task))&&<Tag>{records.filter(r=>r.status==='pending'&&!['frameworkChat','frameworkCheck'].includes(r.target?.task)).length}</Tag>}</button><button className="secondary" onClick={()=>setExportMode('export')}><Download size={15}/>导出</button><button className="primary" onClick={()=>setExportMode('archive')}>收录剧本库</button></header>
 {error&&<div className="fw-error" role="alert"><span>{error}</span><button className="ghost" onClick={()=>setError('')}>关闭</button></div>}{busy&&<div className="fw-running" role="status"><span>{activity.label||'Agent 正在生成候选…'}</span><button className="secondary" onClick={()=>agent.cancel('script',project.id)}>停止</button></div>}
 <div className="fw-content"><div className="fw-stage-content"><div className="fw-stepper" aria-label="创作步骤">{stages.filter(([key])=>key!=='characters').map(([key,label])=><button key={key} className={stage===key?'current':key==='settings'&&f.settings.confirmed?'past':''} onClick={()=>setStage(key)}>{label}</button>)}</div>
 {stage==='world'?<WorldSimulationWorkbench project={project} state={state} setState={setState} getState={currentState} api={api} externalBusy={busy}/>:stage==='ideas'?<IdeasPane {...common}/>:stage==='settings'?<SettingsPane {...common}/>:stage==='events'?<EventsPane {...common}/>:stage==='mainline'?<MainlinePane {...common}/>:stage==='smallEvents'?<SmallEventsPane {...common}/>:stage==='master'?<MasterPane {...common} openExport={()=>setExportMode('export')}/>:stage==='plans'?<PlansPane {...common}/>:stage==='script'?<ScriptPane {...common}/>:stage==='references'?<ReferencesPane {...common}/>:<HistoryPane {...common}/>}
 </div>{simulationRequest&&!record&&!agentOpen&&<aside ref={simulationPanel.panelRef} style={simulationPanel.style} className="fw-context-dock" aria-label="卡片模拟助手"><header {...simulationPanel.handleProps}><strong>模拟助手</strong><button className="secondary" onClick={()=>setSimulationRequest(null)}>收起</button></header><SimulationPane key={JSON.stringify(simulationRequest)} {...common}/></aside>}</div></main>
 {agentOpen&&<FrameworkAgent {...common} options={options} selection={options.find(o=>o.selectionId===selection)?.selectionId||options[0]?.selectionId||''} setSelection={setSelection} skillId={skillId} setSkillId={setSkillId} scope={scope} setScope={setScope} activity={activity} stage={stage} onClose={()=>setAgentOpen(false)}/>}
 {record&&<FrameworkRecordDialog key={record.id} {...common} record={record} onClose={()=>setRecordId('')}/>}
 {exportMode&&<ExportDialog project={project} kind="script" api={api} setState={setState} archive={exportMode==='archive'} onClose={()=>setExportMode('')}/>}

 </div></FrameworkDraftContext.Provider></FrameworkModelContext.Provider>;
}
