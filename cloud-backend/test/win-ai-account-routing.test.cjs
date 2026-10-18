const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('native SPA login/signup/recovery navigations cross into full browser entry; explicit admin entry remains',()=>{
 for(const [path,admin,expected]of [['/sign-in',false,'/login'],['/sign-up',false,'/register'],['/forgot-password',false,'/recover'],['/sign-in?admin=1',true,undefined]]){
  let target;const url=new URL(path,'https://winai.xingzhoufilm.cn');const storage=new Map();if(admin)storage.set('winai_admin_entry','1');
  const context={location:{pathname:'/dashboard/overview',search:'',href:'https://winai.xingzhoufilm.cn/dashboard/overview',replace:u=>target=u},history:{pushState(_a,_b,u){const n=new URL(u,context.location.href);context.location.pathname=n.pathname;context.location.search=n.search;},replaceState(_a,_b,u){this.pushState(_a,_b,u);}},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},URL,URLSearchParams,addEventListener(){},queueMicrotask:fn=>fn()};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../../win-ai/public/account-routing.js'),'utf8'),context);
  context.history.pushState({},'',url.pathname+url.search);assert.equal(target,expected);
 }
});
