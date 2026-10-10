import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createEditBuffer} from './editBuffer.js';
import {createIPProject,getIPProject,mutateIP,ipFingerprint,saveIPVersion,appendIPVersion,beginIPFirstDraft,resolveIPInstruction,importIPNovel,updateIPDraft} from './ipWorkspace.js';

test('actual formatted editor keeps pending human DOM through external refresh, then commits once',()=>{
 const source=fs.readFileSync(new URL('../src/components/FormattedText.jsx',import.meta.url),'utf8');
 const start=source.indexOf('export function FormattedEditor'),end=source.indexOf(' return <div',start);
 const refs=[],effects=[];let cursor=0,flush,changes=[];
 const context={document:{activeElement:null},useRef:v=>refs[cursor++]??(refs[cursor-1]={current:v}),useLayoutEffect:fn=>effects.push(fn),formattedTextHTML:v=>v,serializeFormattedDOM:node=>node.innerHTML,createEditBuffer:opts=>createEditBuffer({...opts,setTimer:()=>1,clearTimer:()=>{}}),registerEditor:f=>{flush=f;return()=>{};}};
 vm.createContext(context);vm.runInContext(source.slice(start,end).replace('export function','function')+'return {input};}\nglobalThis.render=FormattedEditor;',context);
 const render=value=>{cursor=0;effects.length=0;const result=context.render({value,commitDelay:1200,onChange:e=>changes.push(e.target.value)});if(!refs[0].current)refs[0].current={innerHTML:value,textContent:value,dataset:{}};effects.forEach(fn=>fn());return result;};
 const editor=render('旧文本');refs[0].current.innerHTML='人正在输入';editor.input();
 render('云端新文本');assert.equal(refs[0].current.innerHTML,'人正在输入');assert.deepEqual(changes,[]);
 flush();assert.deepEqual(changes,['人正在输入']);render('人正在输入');assert.equal(refs[0].current.innerHTML,'人正在输入');
});

for(const trigger of ['version','settings-ready','final'])test(`actual IP agent flushes buffered human edits before ${trigger} activation`,async()=>{
 let state=createIPProject({fruitProjects:[],scriptProjects:[],scriptLibrary:[]},{name:'验收',duration:120});const id=state.fruitProjects[0].id;
 state=importIPNovel(state,id,{name:'原文',content:'第一章 相遇\n两人相遇。'});let p=getIPProject(state,id);
 const episode=trigger==='settings-ready'?p.episodes[0]:{id:'body',type:'episode',title:'第1集',scriptText:'',chapterIds:[p.creator.ip.source.chapters[0].id],sourceId:p.creator.ip.source.id,ipVersions:[]};
 if(trigger!=='settings-ready')state=mutateIP(state,id,p=>({...p,episodes:[...p.episodes,episode]}));
 let pending=false,settles=0;
 const setState=fn=>{state=fn(state);};
 const source=fs.readFileSync(new URL('../src/creator/useIPAgent.js',import.meta.url),'utf8');
 const context={useRef:v=>({current:v}),useState:v=>[v,()=>{}],Map,Date,Math,getIPProject,mutateIP,ipFingerprint,saveIPVersion,appendIPVersion,beginIPFirstDraft,resolveIPInstruction,runRemainingIPTasks:()=>{},runIPAdaptationFlow:()=>{},flushEditing:()=>{},hasPendingEditing:()=>pending,settleEditing:async()=>{settles++;if(pending){state=updateIPDraft(state,id,episode.id,'人工刚输入的正文');pending=false;}},runIPTask:async args=>{
   const v={type:'version',episodeId:episode.id,content:'AI候选稿',fingerprint:ipFingerprint(getIPProject(state,id),episode.id)};pending=true;
   if(trigger==='version')await args.onDraft(v);
   else if(trigger==='settings-ready')await args.onDraft({type:'settings-ready',episodeId:episode.id,content:v.content,version:v});
   return {...v,type:trigger==='version'?'firstDraft':'body'};
 }};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('export function useIPAgent')).replace('export function','function')+'\nglobalThis.hook=useIPAgent;',context);
 const agent=context.hook({state,setState,getState:()=>state,api:{}});
 const promise=agent.run({projectId:id,task:trigger==='version'?'firstDraft':trigger==='settings-ready'?'settings':'body',episodeId:episode.id,profile:{model:'mock'}});
 if(trigger==='version')await assert.rejects(promise,/生成期间正文或范围已修改/);else await promise;
 const final=getIPProject(state,id).episodes.find(e=>e.id===episode.id);
 assert.equal(final.scriptText,'人工刚输入的正文');assert.ok(final.ipVersions.some(v=>v.content==='AI候选稿'&&v.stale));assert.ok(settles>0);
});
