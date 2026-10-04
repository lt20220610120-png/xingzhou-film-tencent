import test from 'node:test';
import assert from 'node:assert/strict';
import { creatorExportStatus } from './creatorExportStatus.js';

const ip = episodes => ({creator:{mode:'ip',ip:{duration:60,completedImport:true}},episodes});
test('completed imported screenplay can archive without invented settings or an adaptation length target',()=>{
 const project=ip([{type:'settings',title:'设定',scriptText:'',rawText:'',finalConfirmed:false},
  {type:'episode',title:'第1集',scriptText:'完整导入稿',finalConfirmed:true}]);
 assert.deepEqual(creatorExportStatus(project,'fruit','output'),{missing:[],unconfirmed:[],shortIP:false});
});
test('completed import still requires nonempty episodes and reconfirmation after editing',()=>{
 const project=ip([{type:'episode',title:'第1集',scriptText:'',finalConfirmed:false},
  {type:'episode',title:'第2集',scriptText:'修改后',finalConfirmed:true,stale:true}]);
 const result=creatorExportStatus(project,'fruit','output');
 assert.equal(result.missing.length,1);assert.equal(result.unconfirmed.length,2);assert.equal(result.shortIP,false);
});
test('novel adaptation and populated imported settings keep normal confirmation checks',()=>{
 const project=ip([{type:'settings',scriptText:'已提供人物小传',finalConfirmed:false},
  {type:'episode',scriptText:'正文',finalConfirmed:true}]);
 assert.equal(creatorExportStatus(project,'fruit','output').unconfirmed.length,1);
 project.creator.ip.completedImport=false;
 assert.equal(creatorExportStatus(project,'fruit','output').shortIP,true);
});
