const fs=require('node:fs');
const path=require('node:path');

const stableVersion=/^\d+\.\d+\.\d+$/;
const compare=(a,b)=>{
  const left=a.split('.').map(Number),right=b.split('.').map(Number);
  return right[0]-left[0]||right[1]-left[1]||right[2]-left[2];
};
const installer=version=>`Xingzhou-Film-Tencent-Setup-${version}.exe`;

function pruneReleaseInstallers(directory, {keep=5}={}) {
  const root=fs.realpathSync(directory);
  const versions=[];
  for(const entry of fs.readdirSync(root,{withFileTypes:true})) {
    if(!entry.isDirectory() || !stableVersion.test(entry.name)) continue;
    const version=entry.name, folder=path.join(root,version);
    if(fs.realpathSync(folder)!==folder) continue;
    const file=path.join(folder,installer(version));
    try {
      const info=fs.lstatSync(file);
      if(info.isFile()&&info.size>0) versions.push(version);
    } catch(error) {
      if(error.code!=='ENOENT') throw error;
    }
  }
  versions.sort(compare);
  let removedBytes=0;
  for(const version of versions.slice(keep)) {
    const folder=path.join(root,version);
    if(fs.realpathSync(folder)!==folder) continue;
    for(const name of [installer(version),installer(version)+'.blockmap','latest.json','builder-debug.yml','builder-effective-config.yaml']) {
      const file=path.join(folder,name);
      try {
        const info=fs.lstatSync(file);
        if(!info.isFile()) continue;
        fs.unlinkSync(file);
        removedBytes+=info.size;
      } catch(error) {
        if(error.code!=='ENOENT') throw error;
      }
    }
    if(!fs.readdirSync(folder).length) fs.rmdirSync(folder);
  }
  return {kept:versions.slice(0,keep),removed:versions.slice(keep),removedBytes};
}
if(require.main===module) console.log(JSON.stringify(pruneReleaseInstallers(path.resolve(__dirname,'../release'))));
module.exports={pruneReleaseInstallers};
