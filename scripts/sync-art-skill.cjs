const fs=require('node:fs'),path=require('node:path');
const edition=process.argv[2]||'v5';
if(!['v4','v5'].includes(edition))throw new Error('Expected v4 or v5');
const root=path.resolve(__dirname,`../core/builtin-skills/art-asset-list-${edition}`);
const target=path.resolve(__dirname,`../core/artAssetSkill${edition==='v5'?'V5':'V4'}.json`);
const bundle=JSON.parse(fs.readFileSync(target,'utf8'));
const files={};
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else if(entry.name.endsWith('.md'))files[path.relative(root,file).replaceAll('\\','/')]=fs.readFileSync(file,'utf8');}}
scan(root);bundle.files=files;fs.writeFileSync(target,JSON.stringify(bundle,null,2)+'\n');
