const {app, BrowserWindow} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {setTimeout: pause} = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const page = 'scripts/fixtures/wave-three-ui.html';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-storyboard-scroll-'));
app.setPath('userData', profile);
app.setPath('sessionData', profile);
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  let server, win;
  let exit = 0;
  try {
    const {createServer} = await import('vite');
    server = await createServer({root, configFile:false, cacheDir:path.join(profile,'vite-cache'),
      optimizeDeps:{entries:[page]}, server:{host:'127.0.0.1',port:0,watch:null}, logLevel:'error'});
    await server.listen();
    const local = server.resolvedUrls.local[0];
    win = new BrowserWindow({width:1280,height:900,show:false,webPreferences:{backgroundThrottling:false}});
    win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},
      ({url}, done) => done({cancel:!url.startsWith(local)}));
    win.webContents.debugger.attach('1.3');
    const run = (fn, ...args) => win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')');
    const wait = async (fn, ...args) => {
      for(let i=0;i<100;i++) {
        const result = await run(fn,...args);
        if(result) return result;
        await pause(50);
      }
      throw Error('Timed out: '+fn+' '+JSON.stringify(args));
    };
    const movePointerAway = async () => {
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:8,y:8});
      await pause(140);
    };
    const click = (selector, label) => wait((selector,label) => {
      const button = [...document.querySelectorAll(selector)].find(node => node.getClientRects().length &&
        (label === undefined || label === null || [node.textContent.trim(),node.getAttribute('aria-label')].includes(label)));
      button?.click();
      return Boolean(button);
    }, selector,label);
    const physicalClick = async selector => {
      const point = await run(selector => {
        const button = document.querySelector(selector);
        const rect = button.getBoundingClientRect();
        const x=Math.round(rect.x + rect.width/2), y=Math.round(rect.y + rect.height/2);
        return {x,y,hit:document.elementFromPoint(x,y)?.closest('button') === button,
          hovered:document.elementFromPoint(x,y)?.outerHTML.slice(0,150)};
      }, selector);
      assert.ok(point.hit, JSON.stringify({selector,...point}));
      for (const type of ['mousePressed','mouseReleased']) {
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',clickCount:1});
      }
    };
    const stage = '.collab-stage';
    const card = id => '.collab-shot-card[data-shot-id="scroll-'+id+'"]';
    const savePoint = (id, target) => run((id,target) => {
      const shot = document.querySelector('.collab-shot-card[data-shot-id="scroll-'+id+'"]');
      if(target) shot.querySelector(target).scrollIntoView({block:'center'});
      return true;
    },id,target);
    const measure = id => run(id => {
      const stage = document.querySelector('.collab-stage');
      const script = document.querySelector('.collab-sb-script');
      const shot = document.querySelector('.collab-shot-card[data-shot-id="scroll-'+id+'"]');
      return {stage:stage.scrollTop,max:stage.scrollHeight-stage.clientHeight,script:script?.scrollTop,top:shot?.getBoundingClientRect().top-stage.getBoundingClientRect().top,
        refs:shot?.querySelectorAll('.reference-remove').length,grid:shot?.querySelector('.generation-references').offsetHeight,
        header:shot?.querySelector('header').offsetHeight,recover:!!shot?.querySelector('.storyboard-reference-actions details')};
    },id);
    const select = (label, index) => run((label,index) => {
      const element = document.querySelector('select[aria-label="'+label+'"]');
      element.selectedIndex = index;
      element.dispatchEvent(new Event('change',{bubbles:true}));
    },label,index);
    const scrollDown = async (outer = 1040, inner = 800) => {
      const actual = await run((outer,inner) => {
        const stage = document.querySelector('.collab-stage'), script = document.querySelector('.collab-sb-script');
        stage.scrollTop = outer;
        script.scrollTop = inner;
        return [stage.scrollTop, script.scrollTop];
      },outer,inner);
      assert.ok(actual.every(value=>value>0),JSON.stringify(actual));
    };
    const results = [];
    const failures = [];
    const verify = (success,message) => {if (!success) failures.push(message);};
    await win.loadURL(local+page+'?storyboard-scroll');
    await click('#app-sidebar button','项目协作');
    await click('.collab-hub button','进入项目');
    await click('.collab-rail button','分镜');
    await click('.collab-episode-card');
    await wait(selector=>document.querySelectorAll(selector+' .reference-remove').length===8,card('1-1-2'));

    for (const [width,id] of [[1280,'1-1-2'],[1920,'1-1-3'],[1600,'1-1-4']]) {
      await movePointerAway();
      win.setContentSize(width,900);
      await pause(500);
      await savePoint(id,'.reference-remove');
      await pause(150);
      const before = await measure(id);
      await physicalClick(card(id)+' .reference-remove');
      await wait(selector=>document.querySelectorAll(selector+' .reference-remove').length===7,card(id));
      await pause(420);
      const after = await measure(id);
      verify(before.stage > 0 && before.stage === after.stage && before.top === after.top && after.recover,
        width+' 删除参考素材时页面位置变化 '+JSON.stringify({before,after}));
      if(width===1280) verify(after.header > before.header,'窄宽测试未覆盖出现恢复按钮后换行');
      if(width===1920) verify(after.grid < before.grid,'宽屏测试未覆盖两行变一行');
      const result = {case:'remove',width,before,after};
      results.push(result);
      console.log(JSON.stringify(result));
      await click(card(id)+' .storyboard-reference-actions summary');
      await click(card(id)+' .storyboard-reference-recovery button','全部恢复');
      await wait(selector=>document.querySelectorAll(selector+' .reference-remove').length===8,card(id));
      await pause(420);
      const restored = await measure(id);
      verify(before.stage===restored.stage && before.top===restored.top,'恢复素材时页面位置变化 '+width);
    }

    await movePointerAway();
    win.setContentSize(1920,900);
    await pause(500);
    await run(selector=>{const root=document.querySelector(selector);root.scrollTop=root.scrollHeight;},stage);
    const bottomBefore = await measure('1-1-4');
    await physicalClick(card('1-1-4')+' .reference-remove');
    await wait(selector=>document.querySelectorAll(selector+' .reference-remove').length===7,card('1-1-4'));
    await pause(420);
    const bottomAfter = await measure('1-1-4');
    verify(bottomBefore.stage===bottomBefore.max && bottomBefore.stage===bottomAfter.stage &&
      bottomBefore.grid>bottomAfter.grid,'删除底部素材时滚动范围没有保留 '+JSON.stringify({bottomBefore,bottomAfter}));
    await run(selector=>{document.querySelector(selector).scrollTop=0;},stage);
    const naturalMax = await wait((selector,prior)=> {
      const root=document.querySelector(selector), max=root.scrollHeight-root.clientHeight;
      return max<prior && max;
    },stage,bottomBefore.max);
    results.push({case:'remove-at-bottom',bottomBefore,bottomAfter,naturalMax});

    win.setContentSize(1600,900);
    await movePointerAway();
    await savePoint('1-1-2','.collab-add-ref');
    const adding = await measure('1-1-2');
    await physicalClick(card('1-1-2')+' .collab-add-ref');
    await click('.resource-picker-categories button','参考图');
    await click('.resource-picker-select','选择隔离上传');
    await click('.resource-picker-footer button','确认引用');
    await wait(selector=>document.querySelectorAll(selector+' .reference-remove').length===9,card('1-1-2'));
    await pause(450);
    const added = await measure('1-1-2');
    verify(adding.stage===added.stage,'从素材弹窗添加时页面位置变化 '+JSON.stringify({adding,added}));

    await movePointerAway();
    await savePoint('1-1-1','.storyboard-import-scene');
    const importing = await measure('1-1-1');
    await physicalClick(card('1-1-1')+' .storyboard-import-scene');
    await wait(selector=>document.querySelectorAll(selector+' .reference-remove').length===9,card('1-1-1'));
    await pause(450);
    const imported = await measure('1-1-1');
    verify(importing.stage===imported.stage,'导入场景素材时页面位置变化 '+JSON.stringify({importing,imported}));
    results.push({case:'add-and-import',adding,added,importing,imported});

    await movePointerAway();
    await savePoint('1-1-2','.reference-remove');
    await physicalClick(card('1-1-2')+' .reference-remove');
    await wait(selector=>document.querySelectorAll(selector+' .reference-remove').length===8,card('1-1-2'));
    await scrollDown();
    await select('选择场景',1);
    await wait(selector=>!!document.querySelector(selector),card('1-2-1'));
    const scene = await measure('1-2-1');
    verify(scene.stage===0 && scene.script===0,'手动切换同集场景后未回顶 '+JSON.stringify(scene));
    await scrollDown(10000);
    await select('选择集数',1);
    await wait(selector=>!!document.querySelector(selector),card('2-1-1'));
    const episode = await measure('2-1-1');
    verify(episode.stage===0 && episode.script===0,'切换集数后未回顶 '+JSON.stringify(episode));
    await scrollDown();
    await click('.collab-sb-back');
    await click('.collab-episode-card');
    await wait(selector=>!!document.querySelector(selector),card('1-1-1'));
    const overview = await measure('1-1-2');
    verify(overview.stage===0 && overview.script===0 && overview.refs===8,'从总览进入未回顶或被删引用复活 '+JSON.stringify(overview));
    results.push({case:'manual-navigation',scene,episode,overview});

    await click('.collab-rail button','视频池');
    await click('.video-pool-placeholder','打开分镜 2-2-3');
    await wait(selector=>!!document.querySelector(selector),card('2-2-3'));
    await pause(500);
    const deepLink = await measure('2-2-3');
    verify(deepLink.stage>1000 && Math.abs(deepLink.top)<4 && deepLink.script===0,'视频池未定位到指定分镜 '+JSON.stringify(deepLink));
    await select('选择场景',0);
    await wait(selector=>!!document.querySelector(selector),card('2-1-1'));
    await click('.collab-rail button','音色');
    await click('.collab-rail button','分镜');
    await wait(selector=>!!document.querySelector(selector),card('2-1-1'));
    await select('选择场景',1);
    await wait(selector=>!!document.querySelector(selector),card('2-2-1'));
    await pause(600);
    const ordinary = await measure('2-2-1');
    verify(ordinary.stage===0 && ordinary.script===0,'普通切场重新触发旧定位 '+JSON.stringify(ordinary));
    results.push({case:'explicit-navigation',deepLink,ordinary});
    assert.deepEqual(await run(()=>waveThree.attemptedPaid),[]);
    console.log(JSON.stringify(results));
    assert.deepEqual(failures,[]);
  } catch (error) {
    console.error(error);
    exit = 1;
  } finally {
    win?.destroy();
    await server?.close();
    await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200}).catch(()=>{});
    app.exit(exit);
  }
});
