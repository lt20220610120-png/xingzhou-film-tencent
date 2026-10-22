const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
async function verifiedImportedImages(references,destDir){
 if(!Array.isArray(references)||references.length>256)throw Error('素材数量无效');
 const root=await fs.promises.realpath(path.join(destDir,'整本提示词素材'));
 const files=[];
 for(const ref of references){
  const match=/^folder-([a-f0-9]{64})-(png|jpg|jpeg|webp)$/.exec(ref.id||'');
  if(ref.kind!=='image'||!match||typeof ref.filePath!=='string')throw Error('仅支持已导入的本机图片，请重新导入');
  const file=await fs.promises.realpath(ref.filePath),relative=path.relative(root,file);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||path.basename(file)!==`${match[1]}.${match[2]}`)throw Error('图片不在导入素材目录');
  const stat=await fs.promises.stat(file);
  if(!stat.isFile()||stat.size>25*1024*1024)throw Error('图片无效或超过 25 MB');
  const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);
  if(hash.digest('hex')!==match[1])throw Error('图片文件内容已变化，请重新导入并核对关联');
  files.push({id:ref.id,filePath:file});
 }
 return files;
}
async function bindingImageInputs(references,destDir,nativeImage){
 if(!Array.isArray(references)||references.length>24)throw Error('单场看图最多 24 张，请先整理本场素材，或关闭看图并人工核对');
 const files=await verifiedImportedImages(references,destDir),images=[];
 for(const file of files){
  const image=await nativeImage.createThumbnailFromPath(file.filePath,{width:768,height:768});
  if(image.isEmpty())throw Error('无法读取图片内容，请检查素材');
  images.push({id:file.id,dataUrl:'data:image/jpeg;base64,'+image.toJPEG(85).toString('base64')});
 }
 return images;
}
module.exports={verifiedImportedImages,bindingImageInputs};
