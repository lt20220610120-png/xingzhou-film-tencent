const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../core/builtin-skills/art-asset-list-v4');
const target=path.resolve(__dirname,'../core/artAssetSkillV4.json');
const bundle=JSON.parse(fs.readFileSync(target,'utf8'));
const files={};
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else if(entry.name.endsWith('.md'))files[path.relative(root,file).replaceAll('\\','/')]=fs.readFileSync(file,'utf8');}}
scan(root);bundle.files=files;fs.writeFileSync(target,JSON.stringify(bundle,null,2)+'\n');
