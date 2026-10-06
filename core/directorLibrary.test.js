import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareLibraryDirector} from './directorLibrary.js';
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
