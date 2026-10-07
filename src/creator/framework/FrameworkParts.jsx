import React, {createContext,useContext,useEffect,useRef,useState} from 'react';
import {Plus,Check,Lock,Unlock,Trash2,ArrowUp,ArrowDown} from 'lucide-react';
export const FrameworkDraftContext=createContext('framework');
const readDraft=(key,value)=>{try{const saved=JSON.parse(localStorage.getItem(key));return saved&&JSON.stringify(saved.base)===JSON.stringify(value)?saved.value:value;}catch{return value;}};
const writeDraft=(key,base,value)=>{try{localStorage.setItem(key,JSON.stringify({base,value}));}catch{/* The project file writer remains available. */}};
const clearDraft=key=>{try{localStorage.removeItem(key);}catch{}};

export function Heading({title,help,children}){return <div className="fw-heading"><div><h1>{title}</h1><p>{help}</p></div><div className="fw-actions">{children}</div></div>;}
export function Panel({title,extra,children,className=''}){return <section className={`fw-panel ${className}`}>{title&&<header><h3>{title}</h3><div className="fw-actions">{extra}</div></header>}<div className="fw-panel-body">{children}</div></section>;}
export function Empty({children}){return <div className="fw-empty">{children}</div>;}
export function Tag({children,good=false,warn=false}){return <span className={`fw-tag ${good?'good':''} ${warn?'warn':''}`}>{children}</span>;}
export function Field({label,value='',draftKey,onCommit,multiline=true,rows=3,disabled=false,...rest}){
 const scope=useContext(FrameworkDraftContext),key=`xz-field:${scope}:${draftKey||label}`,base=value??'';
 const [draft,setDraft]=useState(()=>readDraft(key,base)),latest=useRef({}),timer=useRef(null),previous=useRef({key,base}),composing=useRef(false);
 latest.current={draft,base,onCommit,key,disabled};
 const commit=()=>{clearTimeout(timer.current);const current=latest.current;if(!composing.current&&!current.disabled&&current.draft!==current.base)current.onCommit?.(current.draft);};
 useEffect(()=>{const old=previous.current;if(old.key===key&&old.base===base)return;previous.current={key,base};if(old.key!==key)setDraft(readDraft(key,base));else {setDraft(base);clearDraft(key);}},[key,base]);
 useEffect(()=>{if(draft!==base&&!disabled){timer.current=setTimeout(commit,350);}return ()=>clearTimeout(timer.current);},[draft,base,disabled]);
 useEffect(()=>()=>{commit();},[]);
 useEffect(()=>{const deadline=setInterval(commit,1000);return ()=>clearInterval(deadline);},[]);
 const props={...rest,'aria-label':label,value:draft,disabled,onChange:e=>{const text=e.target.value;writeDraft(key,base,text);latest.current.draft=text;setDraft(text);},onCompositionStart:()=>{composing.current=true;},onCompositionEnd:()=>{composing.current=false;timer.current=setTimeout(commit,350);},onBlur:commit};
 return <label className="fw-field"><span>{label}</span>{multiline?<textarea {...props} rows={rows}/>:<input {...props}/>}</label>;
}
export function NodeTools({node,locked,command,type,index,count,edit,add}){return <div className="fw-actions fw-node-tools"><button className="ghost" title={node.locked?'解锁':'固定'} aria-label={`${node.title||'事件'}${node.locked?'解锁':'固定'}`} onClick={()=>command({type:'node.lock',id:node.id,locked:!node.locked})}>{node.locked?<Lock size={14}/>:<Unlock size={14}/>}</button>{edit&&<button className="secondary" disabled={locked} onClick={edit}>编辑</button>}{add&&<button className="ghost" disabled={locked} onClick={add}><Plus size={14}/></button>}{index!==undefined&&<><button className="ghost" disabled={locked||index===0} aria-label="向前移动" onClick={()=>command({type:`${type}.move`,id:node.id,index:index-1})}><ArrowUp size={14}/></button><button className="ghost" disabled={locked||index===count-1} aria-label="向后移动" onClick={()=>command({type:`${type}.move`,id:node.id,index:index+1})}><ArrowDown size={14}/></button></>}<button className="ghost" disabled={locked} title="确认内容" onClick={()=>command({type:'node.confirm',id:node.id,confirmed:true})}><Check size={14}/></button><button className="ghost danger" disabled={locked} title="删除" aria-label={`删除${node.title||'事件'}`} onClick={()=>{if(window.confirm('删除此项？关联资料与版本正文会保留，相关内容需重新复核。'))command({type:`${type}.remove`,id:node.id});}}><Trash2 size={14}/></button></div>;}
export function EditDialog({title,fields,initial={},onClose,onSubmit,children}){
 const scope=useContext(FrameworkDraftContext),key=`xz-form:${scope}:${title}:${initial.id||'new'}`;
 const [draft,updateDraft]=useState(()=>readDraft(key,initial)),[error,setError]=useState(''),editor=useRef(null);
 useEffect(()=>{editor.current?.scrollIntoView({block:'nearest'});},[]);
 const setDraft=value=>{updateDraft(value);writeDraft(key,initial,value);};
 return <section ref={editor} className="fw-inline-editor fw-panel" aria-label={title}><header><h3>{title}</h3><small>输入草稿保存在本地</small></header><form className="fw-panel-body" onSubmit={e=>{e.preventDefault();if(onSubmit(draft)!==false){clearDraft(key);onClose();}else setError('请填写名称或必填内容，再保存。');}}><div className="fw-form-grid">{fields.map(([field,label,kind])=><label className={`fw-field ${kind==='long'?'fw-full':''}`} key={field}><span>{label}</span>{kind==='short'?<input autoFocus={field===fields[0][0]} aria-label={label} value={draft[field]??''} onChange={e=>setDraft({...draft,[field]:e.target.value})}/>:<textarea autoFocus={field===fields[0][0]} aria-label={label} rows={kind==='long'?6:3} value={draft[field]??''} onChange={e=>setDraft({...draft,[field]:e.target.value})}/>}</label>)}</div>{typeof children==='function'?children(draft,setDraft):children}{error&&<p role="alert">{error}</p>}<footer className="fw-actions fw-end"><button type="button" className="secondary" onClick={onClose}>收起，保留草稿</button><button className="primary">保存</button></footer></form></section>;
}
export const eventFields=[['title','小事件名称','short'],['summary','事件内容','long'],['before','前置状态'],['after','行动结果'],['motive','人物动机'],['foreshadow','铺垫、伏笔与回收']];
export const categories=['时代与背景','核心脑洞','世界规则','个人金手指'];
