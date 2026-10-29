const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
// Cache only a previously verified file identity. Changed metadata forces a hash;
// the first check after application restart always verifies bytes again.
function createOutputMonitor(){
 const cache=new Map();
 return async function verify(root,file,sha256){
  if(typeof file!=='string'||!file||!sha256)throw Error('缺少文件验收凭据');
  const real=await fs.promises.realpath(file),base=await fs.promises.realpath(root),rel=path.relative(base,real);
  if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('验收文件超出项目目录');
  const stat=await fs.promises.stat(real);if(!stat.isFile()||!stat.size)throw Error('文件为空或无法读取');
  const key=JSON.stringify([real,stat.size,stat.mtimeMs,stat.ctimeMs,sha256]);
  if(cache.has(key))return {file:real,size:stat.size,cached:true};
  const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(real))hash.update(chunk);
  const after=await fs.promises.stat(real);if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs)throw Error('验收时文件正在变化');
  if(hash.digest('hex')!==sha256)throw Error('文件已变化，与验收凭据不一致');
  cache.set(key,true);if(cache.size>5000)cache.delete(cache.keys().next().value);
  return {file:real,size:stat.size,cached:false};
 };
}
module.exports={createOutputMonitor};
