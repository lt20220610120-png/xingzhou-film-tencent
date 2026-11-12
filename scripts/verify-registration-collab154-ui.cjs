// Isolated real React + Edge regression; no credentials, real accounts or project writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.XZ_PLAYWRIGHT_MODULE||'C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({configFile:false,root:path.resolve(__dirname,'..'),optimizeDeps:{entries:['scripts/fixtures/registration-collab154.html']},server:{host:'127.0.0.1',port:0,watch:null},logLevel:'error'});
 await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}/scripts/fixtures/registration-collab154.html`;
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});
 const output=path.resolve(__dirname,'../output/registration-collab154');fs.mkdirSync(output,{recursive:true});
 const report=[];
 try {
 for(const viewport of [{width:1320,height:880},{width:1000,height:660},{width:1700,height:1000}]){
  const page=await browser.newPage({viewport}),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname)){external.push(url.hostname);return route.abort();}return route.continue();});
  await page.goto(base);await page.getByRole('heading',{name:'注册账号',exact:true}).waitFor();
  const username=page.getByLabel('账号',{exact:true}),submit=page.locator('.auth-submit');
  assert.match(await username.getAttribute('placeholder'),/3.*32.*字母.*数字.*下划线/);
  assert.equal(await page.locator('.auth-error').count(),0);
  await username.fill('张导演');await submit.click();
  await page.getByRole('alert').filter({hasText:'不能含中文、空格或其他符号'}).waitFor();
  assert.equal(await page.evaluate(()=>regressionQA.register.length),0);
  assert(await username.evaluate(el=>el===document.activeElement));
  assert.equal(await username.getAttribute('aria-invalid'),'true');
  assert.equal(await username.inputValue(),'张导演');
  await username.fill('STAFF_001');assert.equal(await username.getAttribute('aria-invalid'),'false');
  await page.getByLabel('密码',{exact:true}).fill('12345');await submit.click();
  await page.getByRole('alert').filter({hasText:'密码至少需要 6 位'}).waitFor();
  assert(await page.getByLabel('密码',{exact:true}).evaluate(el=>el===document.activeElement));
  await page.getByLabel('密码',{exact:true}).fill('secret123');await page.getByLabel('确认密码',{exact:true}).fill('different');
  await page.getByLabel('邮箱',{exact:true}).fill('qa@example.com');await page.getByLabel('邀请码',{exact:true}).fill('QA-ONLY');await page.getByLabel('邮箱验证码',{exact:true}).fill('123456');
  await submit.click();await page.getByRole('alert').filter({hasText:'两次输入的密码不一致'}).waitFor();
  assert(await page.getByLabel('确认密码',{exact:true}).evaluate(el=>el===document.activeElement));
  await page.getByLabel('确认密码',{exact:true}).fill('secret123');
  await page.getByLabel('邮箱',{exact:true}).fill('qa@invalid');await submit.click();await page.getByRole('alert').filter({hasText:'邮箱地址格式不正确'}).waitFor();assert(await page.getByLabel('邮箱',{exact:true}).evaluate(el=>el===document.activeElement));
  await page.getByLabel('邮箱',{exact:true}).fill('qa@example.com');await page.getByLabel('邀请码',{exact:true}).fill('');await submit.click();await page.getByRole('alert').filter({hasText:'请输入管理员发放的邀请码'}).waitFor();assert(await page.getByLabel('邀请码',{exact:true}).evaluate(el=>el===document.activeElement));
  await page.getByLabel('邀请码',{exact:true}).fill('QA-ONLY');await page.getByRole('button',{name:'发送验证码',exact:true}).click();await page.waitForFunction(()=>regressionQA.email.length===1);
  const reachable=await submit.evaluate(el=>{el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;});assert(reachable,'主按钮必须可滚动到达');
  await page.evaluate(()=>regressionQA.fail=true);await submit.click();await page.getByRole('alert').filter({hasText:'账号已存在'}).waitFor();
  assert.equal(await username.inputValue(),'STAFF_001');assert.equal(await page.getByLabel('密码',{exact:true}).inputValue(),'secret123');
  await page.evaluate(()=>regressionQA.fail=false);await submit.click();await page.waitForFunction(()=>regressionQA.ready===1);
  assert.equal(await page.evaluate(()=>regressionQA.register.length),2);
  await page.screenshot({path:path.join(output,`register-${viewport.width}.png`),fullPage:true});
  await page.getByRole('button',{name:'已有账号登录',exact:true}).click();await username.fill('legacy.user');await page.getByLabel('密码',{exact:true}).fill('old');await page.locator('.auth-submit').click();await page.waitForFunction(()=>regressionQA.login.length===1);assert.equal(await page.evaluate(()=>regressionQA.login[0].username),'legacy.user','登录不能套用新注册账号规则');
  await page.getByRole('button',{name:'找回账号',exact:true}).click();await page.getByLabel('邮箱',{exact:true}).fill('qa@example.com');await page.getByLabel('邮箱验证码',{exact:true}).fill('123456');await page.getByLabel('新密码（可选）',{exact:true}).fill('');await page.locator('.auth-submit').click();await page.waitForFunction(()=>regressionQA.recover.length===1);assert.equal(await page.evaluate(()=>regressionQA.recover[0].newPassword),undefined);
  await page.goto(base+'?mode=activation');await page.getByRole('button',{name:'创建账号',exact:true}).click();
  await username.fill('wrong-name');await page.locator('.auth-submit').click();await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>regressionQA.register.length),0);
  await page.goto(base+'?mode=collab');await page.locator('.collab-project-grid>.collab-empty').waitFor();
  const metrics=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return {empty:rect('.collab-project-grid>.collab-empty'),grid:rect('.collab-project-grid'),title:rect('.collab-hub h1'),sync:rect('.collab-sync-button'),small:rect('#small-probe'),other:rect('#director-empty-probe'),position:getComputedStyle(document.querySelector('.collab-sync-button')).position};});
  assert(Math.abs(metrics.empty.width-metrics.grid.width)<2);assert(Math.abs(metrics.empty.x-metrics.grid.x)<2);
  assert(metrics.sync.x>=metrics.title.right||metrics.sync.y>=metrics.title.bottom);assert.equal(metrics.position,'static');
  assert(metrics.small.height<100);assert(metrics.other.height<200);
  await page.getByRole('button',{name:'同步项目列表'}).click();await page.waitForFunction(()=>regressionQA.sync.some(p=>p.refreshCloud===true));
  await page.screenshot({path:path.join(output,`collab-${viewport.width}.png`),fullPage:true});
  await page.goto(base+'?mode=collab&producer=1');await page.getByRole('button',{name:'开启项目'}).waitFor();assert.equal(await page.locator('.collab-project-grid>.collab-empty').count(),0);
  await page.goto(base+'?mode=collab&populated=1');await page.getByRole('heading',{name:'隔离回归项目'}).waitFor();assert.equal(await page.locator('.collab-project-grid>.collab-empty').count(),0);
  await page.goto(base+'?mode=api');await page.locator('.api-empty').waitFor();assert.equal(await page.locator('.api-empty p').count(),0);assert.equal(await page.locator('.api-empty').getByRole('button',{name:'添加接口'}).count(),1);
  assert.deepEqual(errors,[]);report.push({viewport,registration:true,activationRegistration:true,invalidNoIPC:true,fieldFocus:true,retryPreservesValues:true,collaboration:metrics,producer:true,populated:true,apiEmpty:true,externalBlocked:external});await page.close();
 }
 fs.writeFileSync(path.join(output,'ui-report.json'),JSON.stringify({passed:true,report},null,2));console.log(JSON.stringify({passed:true,report},null,2));
 }finally{await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
