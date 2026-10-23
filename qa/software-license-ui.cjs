const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});const results=[];try{
 for(const width of [1120,1500,2048]){
  const page=await browser.newPage({viewport:{width,height:940}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5846/qa/software-license.html',{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('heading',{name:'请输入月卡，激活这台电脑'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'进入行舟影视'}).count(),0);
  await page.getByRole('button',{name:'老用户登录 / 账号恢复'}).click();assert.equal(await page.getByRole('button',{name:'创建账号',exact:true}).count(),0);await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByLabel('月卡卡密').fill('XZ-fixture');await page.getByRole('button',{name:'验证卡密 / 续卡'}).click();await page.getByRole('button',{name:'创建账号',exact:true}).first().waitFor();
  await page.getByRole('button',{name:'已有账号登录'}).click();await page.getByLabel('账号',{exact:true}).fill('fixture');await page.getByLabel('密码',{exact:true}).fill('fixture');await page.getByRole('button',{name:'登录账号',exact:true}).click();await page.getByRole('heading',{name:'设备授权有效'}).waitFor();
  await page.getByRole('button',{name:'继续使用当前版本'}).click();await page.getByRole('heading',{name:'已进入工作区'}).waitFor();
  await page.getByLabel('未保存草稿').fill('到期时仍保留');await page.evaluate(()=>qaLicense.expire());await page.getByText('授权校验未通过：已停止新收费，资料保存与已有任务查询下载保留。').waitFor();assert.equal(await page.getByLabel('未保存草稿').inputValue(),'到期时仍保留');
  await page.getByRole('button',{name:'授权 / 续卡'}).click();await page.getByLabel('月卡卡密').fill('XZ-fixture');await page.getByRole('button',{name:'验证卡密 / 续卡'}).click();await page.getByRole('heading',{name:'设备授权有效'}).waitFor();assert((await page.evaluate(()=>qaLicense.calls)).includes('redeem'));
  await page.screenshot({path:`output/license-start-${width}.png`});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await page.goto('http://127.0.0.1:5846/qa/software-license.html?mode=old',{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('heading',{name:'老用户授权 · 无需卡密'}).waitFor();assert.equal(await page.getByLabel('月卡卡密').count(),0);await page.getByRole('button',{name:'继续使用当前版本'}).click();await page.getByRole('heading',{name:'已进入工作区'}).waitFor();assert.equal(await page.getByRole('button',{name:'授权 / 续卡'}).count(),0);
  await page.goto('http://127.0.0.1:5846/qa/software-license.html?mode=admin',{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('button',{name:'生成一张月卡'}).click();await page.getByLabel('新生成卡密').waitFor();assert.equal(await page.getByRole('button',{name:'生成一张月卡'}).isEnabled(),false);await page.getByRole('button',{name:'导出卡密'}).click();assert.equal(await page.getByRole('button',{name:'生成一张月卡'}).isEnabled(),true);
  await page.getByRole('button',{name:'后台解绑'}).click();const modal=page.getByRole('dialog');assert.equal(await modal.getByRole('button',{name:'确认操作'}).isEnabled(),false);await modal.getByLabel('原因').fill('用户更换电脑');await modal.getByRole('button',{name:'确认操作'}).click();assert((await page.evaluate(()=>qaLicense.calls)).some(p=>p.operation==='change'&&p.changeAction==='unbind'&&p.confirmed&&p.reason));
  await page.screenshot({path:`output/license-admin-${width}.png`});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);results.push({width,passed:true});await page.close();
 }fs.writeFileSync('output/license-ui.json',JSON.stringify({passed:true,results},null,2));console.log(JSON.stringify({passed:true,results}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
