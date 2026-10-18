// Actual Chrome+production test fixture. Credentials stay only in process/root-only fixture.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {chromium}=require(process.env.WIN_AI_PLAYWRIGHT||'playwright');
const origin='https://winai.xingzhoufilm.cn',out=path.resolve(__dirname,'../../output/win-ai-browser-account');fs.mkdirSync(out,{recursive:true});
const opts=['-i',path.join(process.env.USERPROFILE,'.ssh/xingzhou_tencent_test'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+path.join(process.env.USERPROFILE,'.ssh/known_hosts_xingzhou')];
function remote(script){return JSON.parse(execFileSync('ssh',[...opts,'ubuntu@106.55.41.128','sudo node -'],{input:script,encoding:'utf8',windowsHide:true,timeout:30000}));}
const preamble=`const fs=require('fs'),crypto=require('crypto');const value=fs.readFileSync('/opt/xingzhou-cloud-backend/.env','utf8').split('\\n').find(x=>x.startsWith('DATABASE_URL=')).slice(13).trim().replace(/^['"]|['"]$/g,'');const {createRepository}=require('/opt/xingzhou-cloud-backend/src/postgres-repository.cjs');const r=createRepository(value);`;
const report={checks:[],publicReachability:false,transport:'Owner-only SOCKS, standard valid HTTPS; not public availability proof'};let fixture,browser;
const checkpoint=step=>{report.step=step;fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(report,null,2));};
setTimeout(()=>{checkpoint('timeout');process.exit(1);},150000).unref();
(async()=>{
 fixture=remote(preamble+`(async()=>{const file='/etc/win-ai/web-qa.json';if(fs.existsSync(file)){console.log(fs.readFileSync(file,'utf8'));process.exit(0);}const username='winaiwebqa_'+crypto.randomBytes(6).toString('hex'),f={username,email:username+'@example.invalid',password:crypto.randomBytes(24).toString('hex'),emailCode:String(crypto.randomInt(10000000,100000000))};await r.saveEmailCode(f.email,require('/opt/xingzhou-cloud-backend/src/email-code.cjs').hashEmailCode(f.emailCode),new Date(Date.now()+3600000).toISOString());fs.writeFileSync(file,JSON.stringify(f),{mode:0o600});console.log(JSON.stringify(f));process.exit(0);})().catch(()=>process.exit(1));`.replaceAll("split('\\\\n')","split('\\n')"));
 browser=await chromium.launch({headless:true,channel:'chrome',proxy:{server:'socks5://127.0.0.1:18319'}});
 const context=await browser.newContext({locale:'zh-CN',viewport:{width:1440,height:1000}}),page=await context.newPage();let nativeBundle;
 page.on('response',async response=>{if(new URL(response.url()).pathname==='/api/oauth/xingzhou'){try{const data=await response.json();if(data.success)nativeBundle=data.data;}catch{}}});
 const failures=[];page.on('pageerror',e=>failures.push(e.message));
 await page.goto(origin+'/register',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'注册 Win AI',exact:true}).waitFor();
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.screenshot({path:path.join(out,'register-desktop.png'),fullPage:true});
 const existing=remote(preamble+`(async()=>{console.log(JSON.stringify({exists:!!await r.findUser(${JSON.stringify(fixture.username)})}));process.exit(0);})().catch(()=>process.exit(1));`);
 if(existing.exists){await page.evaluate(()=>sessionStorage.setItem('winai_admin_entry','1'));await page.goto(origin+'/login');assert.equal(await page.evaluate(()=>sessionStorage.getItem('winai_admin_entry')),null);report.checks.push('public entry clears earlier administrator route marker');for(const name of ['username','password'])await page.locator(`input[name="${name}"]`).fill(fixture[name]);checkpoint('submit existing fixture login');await page.getByRole('button',{name:'登录',exact:true}).click({noWaitAfter:true});}
 else{for(const name of ['username','email','emailCode','password','confirmPassword'])await page.locator(`input[name="${name}"]`).fill(name==='confirmPassword'?fixture.password:fixture[name]);checkpoint('submit signup');await page.getByRole('button',{name:'注册并登录',exact:true}).click({timeout:10000,noWaitAfter:true});}
 await page.waitForURL(u=>u.pathname==='/dashboard/overview',{timeout:45000});checkpoint('dashboard loaded');await page.getByRole('link',{name:'概览',exact:true}).waitFor({timeout:30000});
 assert(nativeBundle?.user);assert.equal(nativeBundle.user.role,1);assert.equal(nativeBundle.user.quota,0);report.nativeId=nativeBundle.user.id;report.checks.push('public signup without invite; native ordinary user, zero quota');
 const source=remote(preamble+`(async()=>{const u=await r.findUser(${JSON.stringify(fixture.username)});if(!u||!u.username.startsWith('winaiwebqa_'))throw Error();console.log(JSON.stringify({roles:u.roles,isAdmin:u.is_admin,isProducer:u.is_producer}));process.exit(0);})().catch(()=>process.exit(1));`.replaceAll("split('\\\\n')","split('\\n')"));
 assert.deepEqual(source,{roles:[],isAdmin:false,isProducer:false});report.checks.push('source signup has no film roles or admin/producer privileges');
 const cookies=await context.cookies();assert(cookies.find(c=>c.name==='__Host-winai_identity'&&c.httpOnly&&c.secure));
 await page.goto(origin+'/wallet',{waitUntil:'networkidle'});await page.getByText('当前余额',{exact:true}).waitFor();await page.screenshot({path:path.join(out,'wallet.png'),fullPage:true});
 const first=nativeBundle.user.id;
 // Real profile menu and confirmation exercise SPA auth routing after logout.
 await page.locator('button').filter({has:page.locator('[data-slot="avatar"]')}).last().click();
 await page.getByRole('menuitem',{name:/退出|登出|Sign out/}).click();
 await page.getByRole('alertdialog').getByRole('button',{name:/退出|登出|Sign out/}).click();
 await page.waitForURL(u=>u.pathname==='/login',{timeout:20000});await page.getByRole('heading',{name:'登录 Win AI',exact:true}).waitFor();
 assert(!(await context.cookies()).some(c=>c.name==='__Host-winai_identity'));report.checks.push('native UI logout clears browser identity and reaches source login without refresh');
 await page.locator('input[name=username]').fill(fixture.username);await page.locator('input[name=password]').fill(fixture.password);nativeBundle=null;
 await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(u=>u.pathname==='/dashboard/overview',{timeout:45000});await page.getByRole('link',{name:'概览',exact:true}).waitFor();assert.equal(nativeBundle.user.id,first);report.checks.push('repeat browser login preserves same native ledger');
 await page.goto(origin+'/recover',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'找回密码',exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'recover-mobile.png'),fullPage:true});
 assert.deepEqual(failures,[]);report.checks.push('390/768/1440 responsive forms and no uncaught page errors');report.ok=true;
})().catch(e=>{report.ok=false;report.error=String(e.message).replaceAll(fixture?.password||'nevermatch','[redacted]').replace(/(?:code|state|ticket)=[^&\s]+/g,'[redacted]');process.exitCode=1;}).finally(async()=>{await browser?.close();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));});
