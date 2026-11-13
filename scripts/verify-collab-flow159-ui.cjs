const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/159-ui');fs.mkdirSync(out,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'xz-flow159-')));
app.whenReady().then(async()=>{let server,window;try{
 const {createServer}=await import('vite');server=await createServer({root,configFile:false,optimizeDeps:{entries:['scripts/fixtures/collab-flow159.html']},server:{host:'127.0.0.1',port:0,watch:null},logLevel:'error'});await server.listen();
 window=new BrowserWindow({width:1520,height:1050,show:false,webPreferences:{backgroundThrottling:false}});const errors=[];window.webContents.on('console-message',(_e,...args)=>{if(args.some(x=>typeof x==='string'&&x.includes('Uncaught')))errors.push(args.join(' '));});
 const run=code=>window.webContents.executeJavaScript(code),wait=async code=>{for(let i=0;i<160;i++){const r=await run(code);if(r)return r;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+code);};
 await window.loadURL(server.resolvedUrls.local[0]+'scripts/fixtures/collab-flow159.html');await wait("document.querySelector('.prompt-art-flow')");
 await run("[...document.querySelectorAll('button')].find(b=>b.textContent==='启动30条').click()");await wait('qaFlow.started.length===5');
 assert.match(await run("document.querySelector('.prompt-art-flow').innerText"),/0\/30/);
 await run('qaFlow.bytes=512');await wait("document.querySelector('.prompt-art-queue-status').innerText.includes('正在接收关联结果')");
 await run("[...document.querySelectorAll('button')].find(b=>b.textContent==='查看场景1-3').click()");await wait("document.querySelector('.prompt-art-queue-status').innerText.includes('本条 1-3-1：排队中')");
 fs.writeFileSync(path.join(out,'queued.png'),(await window.webContents.capturePage()).toPNG());
 await run('qaFlow.pending.values().next().value.resolve()');await wait('qaFlow.started.length===6');assert.match(await run('qaFlow.started[5]'),/^1-3-/);
 await run('qaFlow.release()');await wait("qaFlow.service.status().working===false");await wait("document.querySelector('.prompt-art-flow').innerText.includes('30/30')");
 const summary=await run("({started:qaFlow.started,peak:qaFlow.peak,progress:document.querySelector('.prompt-art-flow').innerText,phase:document.querySelector('.prompt-art-queue-status').innerText,saved:Object.values(qaFlow.saved().decisions).filter(d=>d.confirmed).length})");assert.equal(summary.peak,5);assert.equal(summary.saved,30);assert.equal(summary.started.length,30);
 for(const width of [1280,1920]){window.setSize(width,1050);await new Promise(r=>setTimeout(r,150));assert.equal(await run('document.documentElement.scrollWidth>innerWidth'),false);fs.writeFileSync(path.join(out,`complete-${width}.png`),(await window.webContents.capturePage()).toPNG());}
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,...summary,errors,realModelCalls:0},null,2));
 }catch(error){fs.writeFileSync(path.join(out,'failure.txt'),error.stack);process.exitCode=1;}finally{window?.destroy();await server?.close();app.exit(process.exitCode||0);}});
