import React,{useEffect,useRef,useState} from 'react';
import {mediaSource} from '../../core/generationReferences.js';
import './audio-workbench.css';

export const AUDIO_LANGUAGES=[['Chinese','中文'],['English','英语'],['Auto','自动'],['Japanese','日语'],['Korean','韩语'],['German','德语'],['French','法语'],['Russian','俄语'],['Portuguese','葡萄牙语'],['Spanish','西班牙语'],['Italian','意大利语']];
export const LOCAL_QWEN_PROFILE={name:'本地 Qwen3-TTS 1.7B · Voice Design',provider:'custom',endpoint:'http://127.0.0.1:7891/v1',model:'Qwen3-TTS-12Hz-1.7B-VoiceDesign',apiKey:'',requiresApiKey:false,language:'Chinese',voice:'default',instructions:'成年女性，声线温暖清晰，普通话标准，语气自然，适合短剧对白。'};

export function AudioWorkbench({profile}){
 const [input,setInput]=useState('你好，欢迎来到行舟影视。这是本地语音模型生成的声音。');
 const [instructions,setInstructions]=useState(profile.instructions||''),[language,setLanguage]=useState(profile.language||'Chinese');
 const [busy,setBusy]=useState(false),[result,setResult]=useState(null),[results,setResults]=useState([]),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const alive=useRef(true);
 const loadResults=async()=>{if(!window.xingzhou?.audioResultsList)return[];const rows=await window.xingzhou.audioResultsList();if(alive.current)setResults(Array.isArray(rows)?rows:[]);return rows||[];};
 useEffect(()=>{alive.current=true;loadResults().catch(e=>alive.current&&setError(e.message));return()=>{alive.current=false;};},[]);
 const generate=async()=>{
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{
   if(!window.xingzhou?.audioGenerate)throw Error('请在新版行舟影视桌面应用中生成语音');
   const response=await window.xingzhou.audioGenerate({...profile,input,instructions,language});
   if(alive.current){setResult(response);await loadResults();}
  }catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setBusy(false);}
 };
 const save=async item=>{try{setError('');if(window.xingzhou?.audioResultSave&&item?.id)await window.xingzhou.audioResultSave({id:item.id});else if(item)await window.xingzhou.mediaExportFile({...item,kind:'audio'});if(alive.current){await loadResults();setNotice('已保存语音结果');}}catch(e){if(alive.current)setError(e.message);}};
 const exportResult=async item=>{try{setError('');const file=await window.xingzhou.mediaExportFile({...item,kind:'audio'});if(file&&alive.current)setNotice('已导出 WAV');}catch(e){if(alive.current)setError(e.message);}};
 const remove=async item=>{try{setError('');if(window.xingzhou?.audioResultDelete&&item?.id)await window.xingzhou.audioResultDelete({id:item.id});if(alive.current){if(result?.id===item.id)setResult(null);await loadResults();setNotice('已删除这条语音结果');}}catch(e){if(alive.current)setError(e.message);}};
 const clearAll=async()=>{try{setError('');if(window.xingzhou?.audioResultsClear)await window.xingzhou.audioResultsClear();if(alive.current){setResult(null);setResults([]);setNotice('已清理全部语音结果');}}catch(e){if(alive.current)setError(e.message);}};
 return <section className="audio-workbench" aria-label="语音生成工作台">
  <div className="audio-workbench-heading"><h2>语音生成 / 音色设计</h2><span>WAV 音频</span></div>
  <div className="audio-workbench-fields"><label className="audio-text">配音文本<textarea aria-label="配音文本" maxLength={1000} rows={5} value={input} disabled={busy} onChange={e=>setInput(e.target.value)}/><small>{input.length} / 1000 字符</small></label>
   <label>音色与表演描述<textarea aria-label="音色与表演描述" maxLength={2000} rows={3} value={instructions} disabled={busy} onChange={e=>setInstructions(e.target.value)} placeholder="描述性别、年龄感、声线、情绪与说话方式"/></label>
   <label>配音语言<select aria-label="配音语言" value={language} disabled={busy} onChange={e=>setLanguage(e.target.value)}>{AUDIO_LANGUAGES.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label></div>
  <div className="audio-workbench-actions"><button className="primary" onClick={generate} disabled={busy||!input.trim()}>{busy?'正在生成，请等待…':'生成语音'}</button></div>
  {error&&<p className="collab-error" role="alert">{error}</p>}
  <section className="audio-results-manager" aria-label="语音生成结果管理"><header><h3>生成结果 <span>{results.length}</span></h3><button className="ghost danger" aria-label="清理全部语音结果" disabled={!results.length||busy} onClick={clearAll}>清理全部</button></header>{!results.length?<div className="audio-results-empty">还没有生成结果</div>:<div className="audio-results-list">{results.map((item,index)=><article className={`audio-result-row${item.saved?' is-saved':''}`} key={item.id||item.filePath}><div className="audio-result-meta"><b>语音 {results.length-index}</b><span>{item.saved?'已保存':'待保存'}</span><small>{item.text||'未记录文本'} · {Number(item.duration||0).toFixed(1)} 秒</small></div><audio aria-label={`语音结果 ${results.length-index}`} controls preload="metadata" src={mediaSource(item)}/><div className="audio-result-actions">{item.saved?<span className="audio-result-saved">✓ 已保存</span>:<button className="secondary" onClick={()=>save(item)}>保存</button>}<button className="secondary" onClick={()=>exportResult(item)}>导出 WAV</button><button className="ghost danger" aria-label={`删除语音结果 ${results.length-index}`} onClick={()=>remove(item)}>删除</button></div></article>)}</div>}</section>
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
