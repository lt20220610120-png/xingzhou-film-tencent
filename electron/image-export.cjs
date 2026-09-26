const fs=require('node:fs/promises');
const path=require('node:path');

const safe=value=>String(value||'图片').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100);
const imageExt=image=>{const ext=path.extname(String(image?.filename||'')).toLowerCase();return ['.png','.jpg','.jpeg','.webp','.gif'].includes(ext)?ext:'.png';};
function episodeFolders(image){
 const values=(image.episodes?.length?image.episodes:[image.first_episode]).map(Number).filter(n=>Number.isSafeInteger(n)&&n>0);
 return [...new Set(values)].sort((a,b)=>a-b).map(n=>`第${n}集`);
}
async function uniqueFile(target){
 const ext=path.extname(target),base=target.slice(0,-ext.length);let candidate=target,index=2;
 while(true){try{await fs.access(candidate);candidate=`${base} (${index++})${ext}`;}catch(error){if(error.code==='ENOENT')return candidate;throw error;}}
}
async function exportImagesToFolder({images,dir,layout='flat',fetchImage}){
 if(!['flat','episode'].includes(layout))throw new Error('不支持的图片导出方式');
 await fs.mkdir(dir,{recursive:true});const failures=[];let cursor=0;
 const workers=Array.from({length:Math.min(4,images.length)},async()=>{
  while(cursor<images.length){
   const index=cursor++,image=images[index];
   try{
    const bytes=await fetchImage(image);
    const folders=layout==='episode'?episodeFolders(image):[''];
    for(const folder of folders.length?folders:['未分集']){
     const targetDir=folder?path.join(dir,folder):dir;
     await fs.mkdir(targetDir,{recursive:true});
     const name=`${String(index+1).padStart(3,'0')}-${safe(image.assetName||image.note||'图片')}${imageExt(image)}`;
     await fs.writeFile(await uniqueFile(path.join(targetDir,name)),bytes);
    }
   }catch(error){failures.push(`${image.assetName||image.id||index+1}: ${error.message}`);}
  }
 });
 await Promise.all(workers);
 if(failures.length)throw new Error(`导出完成，但有 ${failures.length} 张失败：${failures.join('；')}`);
 return {dir,count:images.length};
}
module.exports={exportImagesToFolder};
