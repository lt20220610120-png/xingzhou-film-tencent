import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createDirectorCloudSync} from './directorCloudSync.js';
import {acknowledgeDirectorCloudSave} from './directorCloudProjects.js';

for(const change of ['lock','permissions','remove','cloud-id','account','directory'])test(`actual manual upload stops safely when ${change} changes during local persistence`,async()=>{
 const source=fs.readFileSync(new URL('../src/v06/useDirectorQuickGeneration.js',import.meta.url),'utf8');
 const start=source.indexOf('    uploadCloudProject:async id=>{'),end=source.indexOf('\n    },',start);
 const stateRef={current:{directorProjects:[{id:'p',cloudProjectId:'cloud',name:'项目',masterScript:'本地新稿',episodes:[],cloudBase:{name:'项目',script:'旧稿',episodes:[]}}]}},accountRef={current:'a'},directorySwitchRef={current:false};
 let finish,calls=0;const gate=new Promise(resolve=>finish=resolve),setState=fn=>{stateRef.current=fn(stateRef.current);};
 const cloudSync=createDirectorCloudSync({manualOnly:true,getContext:()=>({accountId:accountRef.current,projects:stateRef.current.directorProjects}),updateProject:async args=>{calls++;return{id:'cloud',...args.updates};},acknowledge:({cloud,submitted})=>setState(s=>({...s,directorProjects:acknowledgeDirectorCloudSave(s.directorProjects,cloud,submitted)}))});
 const context={stateRef,accountRef,directorySwitchRef,setState,cloudSync,flushEditing:()=>{},structuredClone,JSON,Date,Error,crypto:{randomUUID:()=>'upload-checkpoint'},persistence:{enqueue:()=>{},flush:()=>gate}};
 vm.createContext(context);vm.runInContext('globalThis.upload='+source.slice(start,end).replace('    uploadCloudProject:','')+'};',context);
 const uploading=context.upload('p');const p=stateRef.current.directorProjects[0];
 if(change==='lock')p.cloudLocked=true;
 if(change==='permissions')p.permissions={canWrite:false};
 if(change==='remove')stateRef.current.directorProjects=[];
 if(change==='cloud-id')p.cloudProjectId='different';
 if(change==='account')accountRef.current='b';
 if(change==='directory')directorySwitchRef.current=true;
 finish();await assert.rejects(uploading,/保留|未上传|上传未确认/);assert.equal(calls,0);assert.equal(p.localCollaborationVersions.length,1);assert.equal(p.localCollaborationVersions[0].document.script,'本地新稿');cloudSync.dispose();
});

test('closed version panel cannot send a restore after its initial read finishes',async()=>{
 const source=fs.readFileSync(new URL('../src/v06/DirectorVersions.jsx',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('export function DirectorVersions'),source.indexOf(' return <Dialog')).replace('export function','function')+'return {adopt};}\nglobalThis.panel=DirectorVersions;';
 let index=0,finish,calls=0;const refs=[],gate=new Promise(resolve=>finish=resolve);
 const values=[[],null,{id:'v',document:{}},false,'','restore','cloud'];
 const context={useMemo:fn=>fn(),versionPreviewPages:text=>[text],useState:()=>[values[index++],()=>{}],useRef:value=>{const ref={current:value};refs.push(ref);return ref;},useEffect:()=>{},Date,Error};
 vm.createContext(context);vm.runInContext(code,context);
 const panel=context.panel({project:{cloudProjectId:'c'},api:{directorCollabGetProject:()=>gate,directorCollabRestoreVersion:async()=>{calls++;}},onCloud:()=>{},onLocal:()=>{},onClose:()=>{}});
 const result=panel.adopt();refs[0].current=false;finish({name:'项目',script:'当前',episodes:[]});await result;assert.equal(calls,0);
});
