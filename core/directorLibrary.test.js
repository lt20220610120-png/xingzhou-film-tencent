import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareLibraryDirector} from './directorLibrary.js';
import {PROTECTED_DIRECTOR_SKILLS} from './clientDistribution.js';

test('new library director projects use the last custom Skill while originals retain their binding',()=>{
 const old={id:'old',name:'旧版 Skill',content:'旧规则'};
 const fresh={id:'fresh',name:'新版 Skill',content:'新规则'};
 const state={directorProjects:[],skills:[...PROTECTED_DIRECTOR_SKILLS,old]};
 const first=prepareLibraryDirector(state,{id:'a',name:'作品 A',content:'第1集\n甲：你好。'});
 assert.equal(first.project.lastUsedSkillId,old.id);
 const later={...first.state,skills:[old,fresh,...PROTECTED_DIRECTOR_SKILLS]};
 const second=prepareLibraryDirector(later,{id:'b',name:'作品 B',content:'第2集\n乙：你好。'});
 assert.equal(second.project.lastUsedSkillId,fresh.id);
 assert.equal(prepareLibraryDirector(second.state,{id:'a'}).project.lastUsedSkillId,old.id);
 const builtIn=prepareLibraryDirector({...state,skills:PROTECTED_DIRECTOR_SKILLS},{id:'c',name:'作品 C',content:'正文'});
 assert.equal(builtIn.project.lastUsedSkillId,PROTECTED_DIRECTOR_SKILLS.at(-1).id);
});
import {removeDirectorCloudProjection} from './directorCloudProjects.js';
test('library import is idempotent and cloud deletion leaves original archive and local director data',()=>{
 const item={id:'lib',name:'同名作品',content:'第1集\n1-1 内景 房间 日\n甲：你好。'};
 const initial={scriptLibrary:[item],directorProjects:[{id:'other',name:'同名作品',episodes:[]}]};
 const {state,project}=prepareLibraryDirector(initial,item);assert.equal(state.directorProjects.length,2);assert.equal(state.scriptLibrary[0],item);
 state.directorProjects[0].episodes[0].prompts=[{id:'prompt',content:'已生成'}];
 const reused=prepareLibraryDirector(state,item);assert.equal(reused.project.id,project.id);assert.equal(reused.project.episodes[0].prompts.length,1);
 const projects=removeDirectorCloudProjection([{...project,cloudProjectId:'cloud-old',cloudRole:'producer'}],'cloud-old');
 assert.equal(projects[0].cloudProjectId,undefined);assert.equal(projects[0].sourceId,'lib');
 assert.equal(initial.scriptLibrary[0].content,item.content);
});
