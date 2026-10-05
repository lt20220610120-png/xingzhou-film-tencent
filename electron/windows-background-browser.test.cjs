const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process'),{EventEmitter}=require('node:events');
const {spawnBackgroundBrowser,windowsArgument}=require('./windows-background-browser.cjs');
const {createOwnedWebBrowser,pause}=require('./owned-web-browser.cjs');
const {findBrowser}=require('./gemini-web.cjs');
const {inspectChatGPTResponse}=require('./chatgpt-web.cjs');
test('native background browser keeps its normal identity on an owned desktop without changing the user desktop',()=>{
 const calls=[],child=Object.assign(new EventEmitter(),{kill:()=>{},stdin:{writable:true,end(){}},stderr:new EventEmitter()});
 const result=spawnBackgroundBrowser('C:\\Browser Folder\\edge.exe',['--user-data-dir=C:\\Owned Profile','https://chatgpt.com/'],{platform:'win32',spawn:(...args)=>{calls.push(args);return child;}});
 const [exe,args,options]=calls[0],script=Buffer.from(args.at(-1),'base64').toString('utf16le');
 assert.equal(exe,'powershell.exe');assert.equal(options.windowsHide,true);assert.equal(options.shell,false);assert.match(script,/CreateDesktop/);assert.match(script,/lpDesktop/);assert.match(script,/AssignProcessToJobObject/);assert.doesNotMatch(script,/SwitchDesktop|--headless|AutomationControlled|navigator\.webdriver|SetCursorPos/);assert.match(result.backgroundDesktop,/^XingzhouOwnedBrowser_/);
 assert.equal(windowsArgument('ending\\'),'"ending\\\\"');assert.equal(windowsArgument('a"b'),'"a\\"b"');
});
test('Windows fixture preserves a normal browser session, shows no user desktop or console window, and stops its owned process tree', {skip:process.platform!=='win32'||!findBrowser(),timeout:60000},async()=>{
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-background-browser-'));
 const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Owned browser fixture</title><p>Local fixture</p>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
 const observations=[];let active;
 const make=()=>createOwnedWebBrowser({profileDir:fixture,url,name:'Fixture',spawn:(...args)=>{const child=spawn(...args);if(args[0]==='powershell.exe'){active=child;let pending='';child.stdout.on('data',chunk=>{pending+=chunk;let i;while((i=pending.indexOf('\n'))>=0){const line=pending.slice(0,i).trim();pending=pending.slice(i+1);try{observations.push(JSON.parse(line));}catch{}}});}return child;}});
 let browser=make();
 try {
  await browser.ensure();await pause(2000);assert.equal(await browser.evaluate('navigator.userAgent.includes("HeadlessChrome")'),false);
  // Exercise both observed website layouts with a real DOM. Future turns,
  // assistant quotations of our marker, and footer/composer text stay outside
  // the response selected for the current request.
  const modern=`<main><div data-turn-key="old"><div data-chatgpt-search-unit-key="old:0:user">XZ_REQUEST_old</div><div data-chatgpt-search-unit-key="old:2:assistant"><div data-markdown-text-style="assistant-message">Old answer</div></div></div><div data-turn-key="current"><div data-chatgpt-search-unit-key="current:0:user">XZ_REQUEST_current<button aria-label="复制消息">copy user</button></div><div data-chatgpt-search-unit-key="current:2:assistant"><h4 data-conversation-role="assistant">ChatGPT 说：</h4><div data-markdown-text-style="assistant-message">连接成功</div></div></div><div data-turn-key="future"><div data-chatgpt-search-unit-key="future:0:user">other request</div><div data-chatgpt-search-unit-key="future:2:assistant"><div data-markdown-text-style="assistant-message">Quoted XZ_REQUEST_current must not become an anchor</div><button aria-label="复制">copy later</button></div></div><footer>ChatGPT 可能会出错。最新一条回复 Medium</footer></main>`;
  await browser.evaluate(`document.body.innerHTML=${JSON.stringify(modern)};true`);
  let response=await browser.evaluate(`(${inspectChatGPTResponse})('XZ_REQUEST_current')`);assert.equal(response.anchored,true);assert.equal(response.text,'连接成功');assert.equal(response.finished,false);
  await browser.evaluate(`document.querySelector('[data-turn-key="current"] [data-chatgpt-search-unit-key$=":assistant"]').insertAdjacentHTML('beforeend','<button aria-label="复制">copy answer</button>');true`);
  response=await browser.evaluate(`(${inspectChatGPTResponse})('XZ_REQUEST_current')`);assert.equal(response.text,'连接成功');assert.equal(response.finished,true);assert.equal(response.streaming,false);
  assert.equal((await browser.evaluate(`(${inspectChatGPTResponse})('XZ_REQUEST_missing')`)).text,'');
  const legacy='<main><article><div data-message-author-role="user">XZ_REQUEST_legacy</div></article><article><div data-message-author-role="assistant"><div class="markdown">json Copy code<pre><code>{"ok":true}</code></pre></div></div><button data-testid="copy-turn-action-button">Copy</button></article><footer>Not screenplay text</footer></main>';
  await browser.evaluate(`document.body.innerHTML=${JSON.stringify(legacy)};true`);response=await browser.evaluate(`(${inspectChatGPTResponse})('XZ_REQUEST_legacy')`);assert.equal(response.text,'{"ok":true}');assert.equal(response.finished,true);
  await browser.evaluate('localStorage.setItem("fixture","retained");true');await browser.close();assert.notEqual(active.exitCode,null);
  browser=make();await browser.ensure();await pause(2000);assert.equal(await browser.evaluate('localStorage.getItem("fixture")'),'retained');await browser.close();assert.notEqual(active.exitCode,null);
  assert.equal(observations.filter(x=>x.processId).length,2);assert.equal(observations.filter(x=>x.consoleWindow===0).length,2);
  const windows=observations.filter(x=>x.userDesktopWindows!==undefined);assert.equal(windows.length,2);for(const row of windows){assert.equal(row.userDesktopWindows,0);assert.equal(row.browserInForeground,false);}
  // Native observations carry only own PIDs and counts, never account data.
  process.stdout.write(JSON.stringify({nativeBackgroundEvidence:observations})+'\n');
 } finally {await browser.close().catch(()=>{});await new Promise(r=>server.close(r));const target=path.resolve(fixture);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert.ok(path.basename(target).startsWith('xingzhou-background-browser-'));fs.rmSync(target,{recursive:true,force:true});}
});
