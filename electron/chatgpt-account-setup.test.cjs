const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../src/v06/chatgpt-account-status.mjs');
test('renderer account check releases disabled actions if IPC never responds',async()=>{
 const {runChatGPTAccountAction}=await load();await assert.rejects(runChatGPTAccountAction({chatgptWebStatus:()=>new Promise(()=>{})},'refresh',{timeoutMs:15}),e=>e.code==='WEB_STATUS_TIMEOUT'&&/超时/.test(e.message));
});
test('renderer can retry after a timed-out check and ignores its late result',async()=>{
 const {runChatGPTAccountAction}=await load();let finish;
 await assert.rejects(runChatGPTAccountAction({chatgptWebStatus:()=>new Promise(r=>finish=r)},'refresh',{timeoutMs:5}));
 const result=await runChatGPTAccountAction({chatgptWebStatus:async()=>({loggedIn:true})},'refresh');finish({loggedIn:false});assert.equal(result.loggedIn,true);
});
test('renderer distinguishes a desktop-only connection from a browser preview',async()=>{
 const {runChatGPTAccountAction}=await load();await assert.rejects(runChatGPTAccountAction({},'refresh'),/桌面应用/);
});
