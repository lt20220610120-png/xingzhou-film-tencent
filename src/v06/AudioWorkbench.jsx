import React,{useEffect,useRef,useState} from 'react';
import {mediaSource} from '../../core/generationReferences.js';
import './audio-workbench.css';

export const AUDIO_LANGUAGES=[['Chinese','中文'],['English','英语'],['Auto','自动'],['Japanese','日语'],['Korean','韩语'],['German','德语'],['French','法语'],['Russian','俄语'],['Portuguese','葡萄牙语'],['Spanish','西班牙语'],['Italian','意大利语']];
export const LOCAL_QWEN_PROFILE={name:'本地 Qwen3-TTS 1.7B · Voice Design',provider:'custom',endpoint:'http://127.0.0.1:7891/v1',model:'Qwen3-TTS-12Hz-1.7B-VoiceDesign',apiKey:'',requiresApiKey:false,language:'Chinese',voice:'default',instructions:'成年女性，声线温暖清晰，普通话标准，语气自然，适合短剧对白。'};

export function AudioWorkbench({profile}){
 const [input,setInput]=useState('你好，欢迎来到行舟影视。这是本地语音模型生成的声音。');
 const [instructions,setInstructions]=useState(profile.instructions||''),[language,setLanguage]=useState(profile.language||'Chinese');
 const [busy,setBusy]=useState(false),[result,setResult]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const generate=async()=>{
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{
   if(!window.xingzhou?.audioGenerate)throw Error('请在新版行舟影视桌面应用中生成语音');
   const response=await window.xingzhou.audioGenerate({...profile,input,instructions,language});
   if(alive.current)setResult(response);
  }catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setBusy(false);}
 };
 const save=async()=>{try{setError('');const file=await window.xingzhou.mediaExportFile({...result,kind:'audio'});if(file&&alive.current)setNotice('已导出语音文件');}catch(e){if(alive.current)setError(e.message);}};
 return <section className="audio-workbench" aria-label="语音生成工作台">
  <div className="audio-workbench-heading"><div><h2>语音生成 / 音色设计</h2><p>当前接口：{profile.name}</p></div><span>WAV 音频</span></div>
  <div className="audio-workbench-fields"><label className="audio-text">配音文本<textarea aria-label="配音文本" maxLength={1000} rows={5} value={input} disabled={busy} onChange={e=>setInput(e.target.value)}/><small>{input.length} / 1000 字符</small></label>
   <label>音色与表演描述<textarea aria-label="音色与表演描述" maxLength={2000} rows={3} value={instructions} disabled={busy} onChange={e=>setInstructions(e.target.value)} placeholder="描述性别、年龄感、声线、情绪与说话方式"/></label>
   <label>配音语言<select aria-label="配音语言" value={language} disabled={busy} onChange={e=>setLanguage(e.target.value)}>{AUDIO_LANGUAGES.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label></div>
  <div className="audio-workbench-actions"><button className="primary" onClick={generate} disabled={busy||!input.trim()}>{busy?'正在生成，请等待…':'生成语音'}</button><small>本地接口请先启动模型服务。首次加载和长文本生成需要更多时间。</small></div>
  {error&&<p className="collab-error" role="alert">{error}</p>}
  {result&&<div className="audio-workbench-result"><audio aria-label="生成语音试听" controls preload="metadata" src={mediaSource(result)}/><button className="secondary" onClick={save}>导出 WAV</button><small>{result.duration?.toFixed(1)} 秒 · 已保存在资料目录「画布素材 / 语音生成」</small></div>}
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
