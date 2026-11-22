const fs=require('node:fs/promises');
const path=require('node:path');

function isChildPath(root,file){
 const relative=path.relative(root,file);
 return Boolean(relative&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative));
}

async function verifiedDataFile(file,directory){
 if(typeof file!=='string'||!path.isAbsolute(file)||!isChildPath(path.resolve(directory),path.resolve(file)))throw Error('素材文件不在本机资料目录');
 const [root,source]=await Promise.all([fs.realpath(directory),fs.realpath(file)]);
 if(!isChildPath(root,source)||!(await fs.stat(source)).isFile())throw Error('素材文件不在本机资料目录或不是普通文件');
 return source;
}

async function verifiedGenerationFiles(input,directory){
 const next={...input};
 if(input.firstFramePath)next.firstFramePath=await verifiedDataFile(input.firstFramePath,directory);
 if(Array.isArray(input.references))next.references=await Promise.all(input.references.map(async ref=>
  ref?.filePath?{...ref,filePath:await verifiedDataFile(ref.filePath,directory)}:ref));
 return next;
}
module.exports={isChildPath,verifiedDataFile,verifiedGenerationFiles};
