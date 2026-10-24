// Full document navigation is required when the native SPA reaches auth pages.
// The gateway binary stays unmodified; identities are verified by Xingzhou.
(()=>{
 const replaceState=history.replaceState.bind(history);
 const isAdmin=()=>new URLSearchParams(location.search).get('admin')==='1';
 const route=()=>{
  if(location.pathname==='/sign-in'){
   if(isAdmin()){try{sessionStorage.setItem('winai_admin_entry','1');}catch{}return;}
   let admin=false;try{admin=sessionStorage.getItem('winai_admin_entry')==='1';}catch{}
   if(admin){const url=new URL(location.href);url.searchParams.set('admin','1');replaceState(history.state,'',url.href);return;}
   location.replace('/login');
  }else if(location.pathname==='/sign-up')location.replace('/register');
  else if(location.pathname==='/forgot-password')location.replace('/recover');
 };
 for(const name of ['pushState','replaceState']){const original=history[name];history[name]=function(...args){const result=original.apply(this,args);queueMicrotask(route);return result;};}
 addEventListener('popstate',route);route();
})();

// This runs inside the native console document (also hosted in WebContentsView),
// so the control belongs to its existing header rather than the desktop shell.
(()=>{
 if(typeof document==='undefined'||document.__winAiHeaderRefresh)return;
 document.__winAiHeaderRefresh=true;
 const selector='[data-winai-header-refresh]';
 const wired=new WeakSet();
 const style=document.createElement('style');
 style.id='winai-header-refresh-style';
 style.textContent=`
  ${selector}{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;margin-inline-start:4px;padding:0;border:1px solid var(--border,#ddd);border-radius:50%;background:transparent;color:inherit;cursor:pointer;vertical-align:middle}
  ${selector}:hover{background:var(--muted,#f1f1f5)}
  ${selector}:focus-visible{outline:2px solid currentColor;outline-offset:2px}
  ${selector} svg{width:15px;height:15px;pointer-events:none}
 `;
 const sync=()=>{
  // Both native app-header and public-header use this brand container. Restrict
  // selection to its home link, never sidebars, nav labels or content headings.
  const brand=Array.from(document.querySelectorAll('header [class~="@container/system-brand"] > a')).find(el=>el.textContent.replace(/\s+/g,' ').trim()==='Win AI');
  let button;
  for(const existing of document.querySelectorAll(selector)){
   if(!button&&brand&&existing.parentNode===brand.parentNode)button=existing;
   else existing.remove();
  }
  if(!brand)return;
  if(!document.getElementById(style.id))document.head.append(style);
  if(!button){
   button=document.createElement('button');
   button.type='button';
   button.setAttribute('data-winai-header-refresh','');
   button.setAttribute('aria-label','刷新 Win AI');
   button.title='刷新 Win AI';
   button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17"/></svg>';
  }
  // A renderer may recreate the header from markup, including our marker.
  // Restore the listener on that new node without multiplying existing ones.
  if(!wired.has(button)){
   button.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    // Reload the current URL in the same session; do not trigger SSO/logout.
    location.reload();
   });
   wired.add(button);
  }
  if(brand.nextSibling!==button)brand.parentNode.insertBefore(button,brand.nextSibling);
 };
 let scheduled=false;
 const schedule=()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;sync();});};
 new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
 sync();
})();
