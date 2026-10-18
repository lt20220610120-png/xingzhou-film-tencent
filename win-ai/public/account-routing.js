// Full document navigation is required when the native SPA reaches auth pages.
// The gateway binary stays unmodified; identities are verified by Xingzhou.
(()=>{
 const isAdmin=()=>new URLSearchParams(location.search).get('admin')==='1';
 const route=()=>{
  if(location.pathname==='/sign-in'){
   if(isAdmin()){try{sessionStorage.setItem('winai_admin_entry','1');}catch{}return;}
   let admin=false;try{admin=sessionStorage.getItem('winai_admin_entry')==='1';}catch{}
   location.replace(admin?'/sign-in?admin=1':'/login');
  }else if(location.pathname==='/sign-up')location.replace('/register');
  else if(location.pathname==='/forgot-password')location.replace('/recover');
 };
 for(const name of ['pushState','replaceState']){const original=history[name];history[name]=function(...args){const result=original.apply(this,args);queueMicrotask(route);return result;};}
 addEventListener('popstate',route);route();
})();
