import React,{useLayoutEffect,useRef,useMemo} from 'react';
import {formattedTextHTML,serializeFormattedDOM} from '../../core/formattedText.js';
import {createEditBuffer} from '../../core/editBuffer.js';
import {registerEditor} from '../editing.js';
export function FormattedText({text,children,className='',query='',...props}) {
 const element=useRef(null),html=useMemo(()=>formattedTextHTML(text??children),[text,children]);
 useLayoutEffect(()=>{
  if(!element.current)return;element.current.innerHTML=html;if(!query)return;
  const walker=document.createTreeWalker(element.current,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){const value=node.textContent,lower=value.toLocaleLowerCase(),search=query.toLocaleLowerCase();let start=0,index=lower.indexOf(search);if(index<0)continue;const fragment=document.createDocumentFragment();while(index>=0){fragment.append(value.slice(start,index));const mark=document.createElement('mark');mark.textContent=value.slice(index,index+query.length);fragment.append(mark);start=index+query.length;index=lower.indexOf(search,start);}fragment.append(value.slice(start));node.replaceWith(fragment);}
 },[html,query]);
 return <div {...props} ref={element} className={`formatted-text ${className}`} dangerouslySetInnerHTML={{__html:html}}/>;
}
export function FormattedEditor({value='',onChange,readOnly=false,placeholder='',className='',onFocus,onBlur,commitDelay=0,...props}) {
 const element=useRef(null),lastElement=useRef(null),emitted=useRef(null),composing=useRef(false),initialMarkup=useRef(null);
 // A stable object is essential: React must not reassign innerHTML on each
 // local save, or it resets the user's caret and destroys native undo.
 if(initialMarkup.current===null)initialMarkup.current={__html:formattedTextHTML(value)};
 const latest=useRef({});latest.current={onChange,readOnly};
 const buffer=useRef(null);
 if(!buffer.current)buffer.current=createEditBuffer({read:()=>serializeFormattedDOM(element.current||lastElement.current),commit:text=>{emitted.current=text;latest.current.onChange?.({target:{value:text},currentTarget:{value:text}});},delay:commitDelay||1200});
 useLayoutEffect(()=>{const unregister=registerEditor(()=>buffer.current.flush(),()=>buffer.current.pending());return()=>{buffer.current.flush();buffer.current.cancel();unregister();};},[]);
 // Human text wins over an asynchronous refresh while it is still buffered.
 // Deliberate action buttons already flush the buffer before replacing value.
 useLayoutEffect(()=>{if(element.current&&value!==emitted.current&&!buffer.current.pending()){element.current.innerHTML=formattedTextHTML(value);emitted.current=value;}},[value]);
 const change=()=>{if(readOnly||composing.current)return;const text=serializeFormattedDOM(element.current);emitted.current=text;onChange?.({target:{value:text},currentTarget:{value:text}});};
 const input=()=>{if(readOnly)return;if(element.current)element.current.dataset.empty=element.current.textContent?'false':'true';if(commitDelay)buffer.current.input();else change();};
 return <div {...props} ref={node=>{element.current=node;if(node)lastElement.current=node;}} role="textbox" aria-multiline="true" aria-readonly={readOnly} tabIndex={0} contentEditable={!readOnly} suppressContentEditableWarning dangerouslySetInnerHTML={initialMarkup.current} className={`formatted-text formatted-editor ${className}`} data-placeholder={placeholder} data-empty={!value} onFocus={onFocus} onBlur={e=>{buffer.current.flush();onBlur?.(e);}} onInput={input} onCompositionStart={()=>{composing.current=true;buffer.current.compositionStart();}} onCompositionEnd={()=>{composing.current=false;buffer.current.compositionEnd();input();}} onPaste={e=>{
  if(readOnly)return;e.preventDefault();const text=e.clipboardData.getData('text/plain');
  // Native insertion preserves caret and browser undo; HTML is never pasted.
  document.execCommand('insertText',false,text);
 }}/ >;
}
