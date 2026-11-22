const { app, BrowserWindow } = require('electron');
const { strict: assert } = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: pause } = require('node:timers/promises');

const root = path.join(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-wave-three-ui-'));
const evidence = process.env.XZ_WAVE_THREE_UI_OUTPUT;
app.setPath('userData', profile);
app.setPath('sessionData', profile);
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  let server, win;
  let exit = 0;
  try {
    const { createServer } = await import('vite');
    server = await createServer({root, configFile:false, cacheDir:path.join(profile,'vite-cache'),
      optimizeDeps:{entries:['scripts/fixtures/wave-three-ui.html']},
      server:{host:'127.0.0.1', port:0, watch:null}, logLevel:'error'});
    await server.listen();
    win = new BrowserWindow({ width:1280, height:920, show:false, webPreferences:{ backgroundThrottling:false } });
    const errors = [];
    const external = [];
    win.webContents.on('console-message', event => {
      const message = event.message || '';
      if (/Uncaught|xingzhou-render-error|Maximum update depth/.test(message)) errors.push(message);
    });
    win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']}, (details, callback) => {
      const blocked = !details.url.startsWith(server.resolvedUrls.local[0]);
      if (blocked) external.push(new URL(details.url).hostname);
      callback({cancel:blocked});
    });
    win.webContents.debugger.attach('1.3');
    const run = code => win.webContents.executeJavaScript(code, true);
    const wait = async code => {
      for (let i=0; i<80; i++) {
        const result = await run(code);
        if (result) return result;
        await pause(75);
      }
      throw Error('Timed out: '+code);
    };
    const command = (name,args) => win.webContents.debugger.sendCommand(name,args);
    const press = async (key, virtualKey, code=key) => {
      await command('Input.dispatchKeyEvent',{type:'keyDown',key,code,text:key===' '?key:undefined,windowsVirtualKeyCode:virtualKey,nativeVirtualKeyCode:virtualKey});
      await command('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtualKey,nativeVirtualKeyCode:virtualKey});
    };
    const mouse = async (x,y) => {
      await command('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
      await command('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
    };
    const click = async (selector, label) => {
      const query = JSON.stringify(selector);
      const name = JSON.stringify(label);
      await wait(`(() => {
        const el = [...document.querySelectorAll(${query})].find(node => node.getClientRects().length && (node.getAttribute('aria-label') === ${name} || node.textContent.trim() === ${name}));
        if (!el) return false; el.click(); return true;
      })()`);
    };
    const nav = label => click('#app-sidebar button', label);
    await win.loadURL(server.resolvedUrls.local[0]+'scripts/fixtures/wave-three-ui.html');
    await wait('document.querySelector("#app-sidebar")?.getClientRects().length');
    assert.equal(await run("CSS.supports('appearance','base-select')"),true);

    const panels = [];
    for (const width of [1280,1600,1920]) {
      win.setContentSize(width,900);
      await pause(100);
      for (const [label,selector] of [['导演工作台','.director-shell'],['图视生成','.generation-workspace'],['设置','.settings-page'],['管理后台','.admin-panel'],['API 接口','.api-library']]) {
        await nav(label);
        await wait(`document.querySelector('${selector}')?.getClientRects().length`);
        const measured = await run(`(() => {
          const main=document.querySelector('${selector}');
          return {width:innerWidth, pageWidth:document.documentElement.scrollWidth, background:getComputedStyle(document.body).backgroundColor, selects:[...main.querySelectorAll('select')].filter(n=>n.getClientRects().length).map(n=>getComputedStyle(n).appearance)};
        })()`);
        assert.equal(measured.width,width);
        assert.ok(measured.pageWidth<=width,`${label} overflows at ${width}`);
        assert.ok(measured.selects.every(appearance=>appearance==='base-select'),JSON.stringify({label,measured}));
        panels.push({width,label,selects:measured.selects.length,background:measured.background});
      }

      await run(`(() => {
        document.getElementById('qa-edge-zone')?.remove();
        const region=document.createElement('div');
        region.id='qa-edge-zone';
        region.style.cssText='position:fixed;right:9px;bottom:10px;width:174px;height:34px;overflow:hidden;z-index:9000';
        const select=document.createElement('select');
        select.id='qa-edge-picker';
        select.style.cssText='width:170px;height:33px;padding-inline-start:8px';
        for(let i=0;i<60;i++){const opt=new Option('隔离候选 '+i,String(i));if(i===1)opt.disabled=true;select.add(opt);}
        region.append(select);document.body.append(region);
      })()`);
      const center=await run(`(() => {const r=document.querySelector('#qa-edge-picker').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      await mouse(...center);
      await wait("document.querySelector('#qa-edge-picker').matches(':open')");
      await pause(170);
      const box=await run(`(() => {
        const picker=document.querySelector('#qa-edge-picker');
        const option=picker.options[0].getBoundingClientRect(), trigger=picker.getBoundingClientRect();
        const found=document.elementFromPoint(option.x+10,option.y+10);
        return {option:[option.x,option.y,option.right,option.bottom], trigger:trigger.y, visible:found===picker.options[0],radius:getComputedStyle(picker,'::picker(select)').borderRadius,checked:getComputedStyle(picker.options[0]).backgroundColor};
      })()`);
      assert.ok(box.option[0]>=0&&box.option[2]<=width&&box.option[1]>=0&&box.option[3]<box.trigger,JSON.stringify(box));
      assert.ok(box.visible,JSON.stringify(box));
      assert.equal(box.radius,'12px');
      assert.notEqual(box.checked,'rgba(0, 0, 0, 0)');
      if (evidence && width===1280) fs.writeFileSync(path.join(evidence,'picker-at-edge.png'),(await win.webContents.capturePage()).toPNG());
      await command('Input.dispatchMouseEvent',{type:'mouseWheel',x:Math.round(box.option[0]+28),y:Math.round(box.option[1]+42),deltaX:0,deltaY:430});
      await wait(`document.querySelector('#qa-edge-picker').options[0].getBoundingClientRect().top < ${box.option[1]-100}`);
      await press('Escape',27);
      await wait("!document.querySelector('#qa-edge-picker').matches(':open')");
      await run("document.querySelector('#qa-edge-picker').focus()");
      await press(' ',32,'Space');
      await wait("document.querySelector('#qa-edge-picker').matches(':open')");
      await press('ArrowDown',40);
      await press('Enter',13);
      await wait("document.querySelector('#qa-edge-picker').value==='2' && !document.querySelector('#qa-edge-picker').matches(':open')");
      await mouse(...center);
      await wait("document.querySelector('#qa-edge-picker').matches(':open')");
      await mouse(10,40);
      await wait("!document.querySelector('#qa-edge-picker').matches(':open')");
      await run("document.querySelector('#qa-edge-zone').remove()");
    }

    await nav('图视生成');
    await click('.generation-tabs button','AI图片生成');
    await wait("document.querySelector('.generation-result-grid').childElementCount===48");
    await run(`document.querySelector('.generation-workspace textarea[aria-label="提示词"]').focus()`);
    await command('Input.insertText',{text:'隔离保活试写'});
    await wait("document.querySelector('.generation-workspace .prompt-highlight-layer')?.textContent==='隔离保活试写'");
    await click('.generation-tabs button','API 设置');
    await click('.media-api-modes button','自定义接口');
    const modalPicker = await wait(`(() => {
      const select=document.querySelector('.media-api-form select');if(!select)return false;
      const box=select.getBoundingClientRect();return [box.x+box.width/2,box.y+box.height/2];
    })()`);
    await mouse(...modalPicker);
    await wait("document.querySelector('.media-api-form select').matches(':open')");
    await press('Escape',27);
    await wait("document.querySelector('.media-api-form select') && !document.querySelector('.media-api-form select:open')");
    await nav('设置');
    assert.equal(await run("document.querySelectorAll('select:open').length"),0);
    await nav('图视生成');
    assert.match(await wait("document.querySelector('.generation-tabs button.active')?.textContent"),/AI图片生成/);
    assert.equal(await run(`document.querySelector('.generation-workspace textarea[aria-label="提示词"]')?.value`),'隔离保活试写');
    assert.equal(await run("!!document.querySelector('.media-api-settings')"),false);

    await nav('项目协作');
    await wait("document.querySelector('.collab-shell,.collab-hub')?.getClientRects().length");
    await click('.collab-hub button, .collab-hub [role=button]','进入项目');
    await wait("document.querySelector('.collab-rail')?.getClientRects().length");
    for (const width of [1280,1600,1920]) {
      win.setContentSize(width,900);
      for (const label of ['清单核实','资产','分镜','音色']) {
        await click('.collab-rail button',label);
        if(label==='分镜') {
          const entered=await run(`(() => {const episode=document.querySelector('.collab-episode-card');episode?.click();return !!episode;})()`);
          if(entered)await wait("!!document.querySelector('select[aria-label=选择集数]')");
        }
        await pause(130);
        const selects=await run("[...document.querySelectorAll('.collab-stage select')].filter(n=>n.getClientRects().length).map(n=>getComputedStyle(n).appearance)");
        assert.ok(selects.every(appearance=>appearance==='base-select'));
        assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'),`${label} overflows at ${width}`);
        panels.push({width,label,selects:selects.length});
      }
    }
    await nav('设置');
    await pause(200);
    const before=await run("waveThree.counts.collabGetProject || 0");
    await pause(12500);
    assert.equal(await run("waveThree.counts.collabGetProject || 0"),before);

    await run(`(() => {
      const trigger = document.querySelector('#app-sidebar button[aria-label="设置"]');
      trigger.focus();
      window.waveThree.confirmAction('永久删除隔离测试记录？', {danger:true}).then(value=>window.waveThree.choice=value);
    })()`);
    await wait("!!document.querySelector('dialog.workspace-dialog:modal')");
    assert.equal(await run("document.activeElement.textContent"),'取消');
    if(evidence)fs.writeFileSync(path.join(evidence,'confirm.png'),(await win.webContents.capturePage()).toPNG());
    await press('Escape',27);
    await wait("waveThree.choice===false && !document.querySelector('dialog.workspace-dialog')");
    assert.equal(await run("document.activeElement.getAttribute('aria-label')"),'设置');
    await click('#app-sidebar button','切换身份');
    await click('.role-switch-menu button','内容创作者');
    await nav('创作剧本');
    await wait("document.querySelector('.creator-hub')?.getClientRects().length");
    for(const width of [1280,1600,1920]) {
      win.setContentSize(width,900);
      await pause(100);
      assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'));
      panels.push({width,label:'创作剧本'});
    }
    await run("waveThree.confirmAction('授权测试操作').then(value=>waveThree.afterLock=value);void 0");
    await wait("!!document.querySelector('dialog.workspace-dialog:modal')");
    await run("waveThree.licenseChanged({allowed:false,status:'inactive'});void 0");
    await wait("document.querySelector('.startup-license-lock') && waveThree.afterLock===false && !document.querySelector('dialog.workspace-dialog')");
    assert.deepEqual(await run('waveThree.attemptedPaid'),[]);
    assert.deepEqual(errors,[]);
    assert.deepEqual(external.filter(host=>/font/.test(host)),[]);
    const result={panels, backgroundCollabReads:0, initialImageRows:48, paidCalls:0, networkFontRequests:0};
    if(evidence) fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error);
    if (win && !win.isDestroyed()) console.error(await win.webContents.executeJavaScript(`({
      display: document.querySelector('.render-error-page')?.innerText || '',
      tabs: [...document.querySelectorAll('.collab-rail button')].map(b=>b.textContent.trim()),
      smokeBody: document.body.innerText.slice(0,1200),
    })`).catch(()=>null));
    exit = 1;
  } finally {
    win?.destroy();
    await server?.close();
    app.exit(exit);
  }
});
