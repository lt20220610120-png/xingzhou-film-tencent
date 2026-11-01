import React,{useEffect,useState} from 'react';
import {ChoiceField} from './ProductionControls.jsx';
import {mediaModelChoices} from '../../core/modelChoices.js';

export function VoiceWorkflowSettings({config,onChange,state,disabled=false}){
 const enabled=config.voiceEnabled===true,audio=mediaModelChoices(state,'audio'),texts=(state.apiProfiles||[]).map(p=>({id:p.id,name:`${p.name} · ${p.model}`}));
 const selected=audio.find(m=>m.id===config.voiceModelId||m.profileId===config.voiceModelId);
 const localQwen=selected?.model==='Qwen3-TTS-12Hz-1.7B-VoiceDesign'&&/^http:\/\/(?:127\.0\.0\.1|localhost):7891(?:\/|$)/.test(selected?.endpoint||'');
 return <section className="furnace-voice-policy" aria-label="人物音色设置">
  <div className="furnace-voice-switch"><div><strong>人物音色</strong><small>{enabled?'生成并采用人物音色，再关联到后续视频':'关闭时直接接续美术和视频'}</small></div><button type="button" role="switch" aria-label="启用人物音色" aria-checked={enabled} disabled={disabled} onClick={()=>onChange({voiceEnabled:!enabled})}><span/>{enabled?'已开启':'已关闭'}</button></div>
  <fieldset disabled={disabled||!enabled} className="furnace-form furnace-voice-fields">
   <ChoiceField label="人物音色生成模型" value={selected?.id||config.voiceModelId} options={audio} disabled={disabled||!enabled} onChange={voiceModelId=>onChange({voiceModelId})}/>
   <ChoiceField label="音色前置信息补充模型" value={config.voiceCompletionProfileId} options={texts} disabled={disabled||!enabled} onChange={voiceCompletionProfileId=>onChange({voiceCompletionProfileId})}/>
   <ChoiceField label="音色分发模型" value={config.voiceDistributionProfileId} options={texts} disabled={disabled||!enabled} onChange={voiceDistributionProfileId=>onChange({voiceDistributionProfileId})}/>
   <label>音色生成并发数<input aria-label="音色生成并发数" type="number" min="1" step="1" value={config.voiceConcurrency??1} onChange={e=>onChange({voiceConcurrency:e.target.value===''?'':Number(e.target.value)})}/></label>
  </fieldset>
  {localQwen&&<p className="furnace-local-voice-capacity">本机 Qwen 当前部署实测：有效生成并发 1；同时提交 2 条时额外请求返回忙碌。可更换模型后自行设置并发数。</p>}
 </section>;
}

export function RuntimeVoiceSettings({run,state,production,onAction}){
 const [draft,setDraft]=useState(run.config),[notice,setNotice]=useState('');
 useEffect(()=>{setDraft(run.config);setNotice('');},[run.id,run.config]);
 return <details className="furnace-runtime-voices"><summary>人物音色 · {run.config.voiceEnabled===true?'已开启':'已关闭'}</summary>
  <VoiceWorkflowSettings config={draft} state={state} disabled={run.status==='done'} onChange={patch=>{setDraft(c=>({...c,...patch}));setNotice('');}}/>
  <div className="furnace-runtime-voice-actions"><small>{notice||'运行中开启音色会暂停新派发；点击继续，补跑音色后接续。'}</small><button type="button" disabled={run.status==='done'} onClick={()=>onAction(async()=>{await production.updateVoicePolicy(run.id,draft);setNotice(draft.voiceEnabled?'已应用；点击开始 / 继续接续':'已关闭；不再派发音色任务');})}>应用音色设置</button></div>
 </details>;
}
