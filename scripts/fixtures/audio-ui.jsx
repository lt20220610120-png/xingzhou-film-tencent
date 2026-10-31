import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ApiLibrary} from '../../src/v06/GlobalTools.jsx';
import {createInitialState} from '../../core/projectStore.js';
import '../../src/styles.css';
import '../../src/v06.css';
import '../../src/ocean-theme.css';
window.audioQA={calls:[],exports:[],saved:[],deleted:[],cleared:0,results:[],fail:false,delay:false};
window.xingzhou={audioResultsList:async()=>window.audioQA.results,audioResultSave:async p=>{window.audioQA.saved.push(p.id);window.audioQA.results=window.audioQA.results.map(r=>r.id===p.id?{...r,saved:true}:r);return true;},audioResultDelete:async p=>{window.audioQA.deleted.push(p.id);window.audioQA.results=window.audioQA.results.filter(r=>r.id!==p.id);return true;},audioResultsClear:async()=>{window.audioQA.cleared++;window.audioQA.results=[];return 0;},audioGenerate:async p=>{window.audioQA.calls.push(p);if(window.audioQA.delay)await new Promise(r=>window.audioQA.finish=r);if(window.audioQA.fail)throw Error('无法连接语音服务，请先启动本地模型');const result={id:'audio-'+window.audioQA.calls.length,filePath:'D:/行舟影视/画布素材/语音生成/test'+window.audioQA.calls.length+'.wav',mime:'audio/wav',duration:4.2,text:p.input,saved:false};window.audioQA.results=[result,...window.audioQA.results];return result;},mediaExportFile:async p=>{window.audioQA.exports.push(p);return 'D:/test.wav';}};
function App(){const [state,setState]=useState(createInitialState());window.audioQA.state=state;return <main style={{padding:36,marginLeft:190}}><aside style={{position:'fixed',inset:'0 auto 0 0',width:190,padding:24,background:'#f1edf9'}}><h3>行舟影视</h3><p style={{marginTop:60}}>API 接口</p></aside><ApiLibrary state={state} setState={setState}/></main>;}
createRoot(document.getElementById('root')).render(<App/>);
