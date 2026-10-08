import {createWorld,addCandidate,commitCandidate,forkAt,compareBranches,exportLife} from './engine.js';
import {WorldStore} from './store.mjs';
import fs from 'node:fs';
const command=process.argv[2]||'demo';
if(command==='demo'){
 let w=createWorld({characters:[{id:'hero',name:'演示主角',resources:{money:10}},{id:'general',name:'演示将军'}],rules:[],locations:[]},{name:'独立内核示例'});
 const rescue={id:'rescue',title:'救下将军',summary:'主角救下将军，获得信任',time:1,actorIds:['hero','general'],effects:[{entityId:'hero',field:'relations.general',op:'set',value:'信任'}],observations:[{actorId:'hero',text:'将军许诺回报'}]};
 const join={id:'join',title:'加入军队',summary:'主角因信任得到引荐',time:2,actorIds:['hero'],dependsOn:['rescue'],effects:[{entityId:'hero',field:'resources.money',op:'add',value:5}]};w=commitCandidate(addCandidate(w,'main',{id:'r',name:'军中路线',events:[rescue,join]}),'main','r');w=forkAt(w,'main','rescue',{...rescue,summary:'主角选择离开',effects:[],observations:[]},{name:'经商分支'});
 console.log(JSON.stringify({demo:true,branches:w.branches.length,pending:compareBranches(w,'main',w.activeBranchId).pending,life:exportLife(w,'main','hero')},null,2));
 if(process.argv[3]){const db=new WorldStore(process.argv[3]);db.save(w,0);db.close();}
}else if(command==='inspect'&&process.argv[3]){const w=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));console.log(exportLife(w,w.activeBranchId,process.argv[4]||w.seed.characters[0]?.id));}else {console.error('使用：node cli.mjs demo [新SQLite文件] / inspect world.json [人物ID]');process.exitCode=1;}
