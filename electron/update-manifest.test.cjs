const test=require('node:test');
const assert=require('node:assert/strict');
const {fetchUpdateManifest}=require('./update-manifest.cjs');

const manifest={version:'0.9.3',installerUrl:'https://example.com/setup.exe'};

test('官方更新源连接失败时自动改用备用源',async()=>{
 const calls=[];
 const fetchFn=async url=>{calls.push(url);if(url.includes('raw.githubusercontent.com'))throw new TypeError('fetch failed');return {ok:true,json:async()=>manifest}};
 const result=await fetchUpdateManifest('https://raw.githubusercontent.com/o/r/main/latest.json',{fetchFn,retries:1,sleep:async()=>{}});
 assert.deepEqual(result.manifest,manifest);
 assert.match(result.source,/cdn\.jsdelivr\.net/);
 assert.equal(calls.length,2);
});

test('更新源临时失败会重试后成功',async()=>{
 let attempts=0;
 const fetchFn=async()=>{attempts++;if(attempts<2)throw new Error('temporary');return {ok:true,json:async()=>manifest}};
 const result=await fetchUpdateManifest('https://raw.githubusercontent.com/o/r/main/latest.json',{fetchFn,retries:2,sleep:async()=>{}});
 assert.equal(result.manifest.version,'0.9.3');
 assert.equal(attempts,2);
});

test('所有更新源均不可用时返回可读中文错误',async()=>{
 await assert.rejects(()=>fetchUpdateManifest('https://raw.githubusercontent.com/o/r/main/latest.json',{fetchFn:async()=>{throw new TypeError('fetch failed')},retries:1,sleep:async()=>{}}),/暂时无法连接更新服务器，请稍后重新检查/);
});

test('拒绝不安全的更新清单地址',async()=>{
 await assert.rejects(()=>fetchUpdateManifest('http://example.com/latest.json'),/更新地址必须使用 HTTPS/);
});
