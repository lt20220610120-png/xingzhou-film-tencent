import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from './projectStore.js';
import { buildCreatorText,archiveCreatorProject } from './creatorWorkspace.js';
import { updateIPDraft,importIPNovel } from './ipWorkspace.js';
import { projectNameFromFile,parseCompletedScript,prepareNovelProject,prepareCompletedProject,appendPreparedProject } from './creatorDirectImport.js';

test('file names create readable names without requiring another project-name step',()=>{
 assert.equal(projectNameFromFile('D:\\书稿\\让你继承武馆 (3).TXT'),'让你继承武馆 (3)');
 assert.equal(projectNameFromFile('/books/完整剧本.docx'),'完整剧本');
 assert.equal(projectNameFromFile(''),'导入作品');
});

test('novel upload prepares one fully imported project before the React state updater',()=>{
 const content='第1章 开端\r\n  原文。\r\n\r\n第2章 结尾\r\n真实终点。';
 const prepared=prepareNovelProject({fileName:'武馆.txt',content,encoding:'UTF-8'},{duration:120,selection:'saved-model'});
 assert.equal(prepared.name,'武馆');assert.equal(prepared.creator.ip.duration,120);assert.equal(prepared.creator.ip.selection,'saved-model');
 assert.equal(prepared.creator.ip.source.content,content);assert.equal(prepared.creator.ip.source.chapters.length,2);
 const old={id:'old',name:'已有项目'},state={...createInitialState(),fruitProjects:[old]};
 const next=appendPreparedProject(state,prepared);
 assert.equal(next.fruitProjects[0],old);assert.equal(next.fruitProjects[1].id,prepared.id);assert.equal(state.fruitProjects.length,1);
 assert.equal(appendPreparedProject(state,prepared).fruitProjects[1].id,prepared.id);
});

test('completed script boundaries preserve exact input, indentation, CRLF and scene headings',()=>{
 const content='剧名：武馆\r\n人物：阿舟\r\n\r\n第1集 起点\r\n1-1 日 内 武馆\r\n  阿舟：开门。\r\n\r\n第2集\r\n2-1 夜 外 路口\r\n  △ 他走远。\r\n';
 const parsed=parseCompletedScript(content);
 assert.equal(parsed.episodes.length,3);assert.equal(parsed.episodes[0].type,'settings');
 assert.equal(parsed.episodes[1].title,'第1集 起点');assert.equal(parsed.episodes[2].title,'第2集');
 assert.equal(parsed.episodes.map(e=>content.slice(e.start,e.end)).join(''),content);
 assert.equal(parsed.episodes[1].content,'1-1 日 内 武馆\r\n  阿舟：开门。\r\n\r\n');
 const p=prepareCompletedProject({fileName:'完成版.docx',content},{kind:'fruit'});
 assert.equal(p.creator.directImport.content,content);
 for(const e of p.episodes){assert.equal(e.rawText,e.scriptText);assert.equal(e.finalConfirmed,true);}
 assert.equal(buildCreatorText(p,'fruit','input'),buildCreatorText(p,'fruit','output'));
});

test('finished IP script can be read and archived without fabricating a novel or planning',()=>{
 const p=prepareCompletedProject({fileName:'成稿.txt',content:'第1集\n1-1 日 内\n阿舟：你好。\n第2集\n2-1 夜 外\n阿舟：再见。'},{kind:'ip'});
 assert.equal(p.creator.mode,'ip');assert.equal(p.creator.ip.completedImport,true);assert.equal(p.creator.ip.source,null);assert.equal(p.creator.ip.plan,null);
 assert.deepEqual(p.episodes.map(e=>e.type),['settings','episode','episode']);assert.equal(p.episodes[0].scriptText,'');
 let state=appendPreparedProject(createInitialState(),p);state=archiveCreatorProject(state,p.id);
 const snapshot=state.scriptLibrary[0].content;
 state=updateIPDraft(state,p.id,p.episodes[1].id,'新的正文');
 assert.equal(state.scriptLibrary[0].content,snapshot);assert.equal(state.fruitProjects[0].creator.ip.completedImport,true);
});

test('plain completed text remains one readable episode, empty documents and duplicate IDs fail atomically',()=>{
 const p=prepareCompletedProject({fileName:'正文.txt',content:'  无集号的正文\r\n仍保留全部内容。\r\n'},{kind:'ip'});
 assert.equal(p.episodes[1].scriptText,'  无集号的正文\r\n仍保留全部内容。\r\n');
 assert.throws(()=>prepareCompletedProject({fileName:'空.txt',content:' \r\n'},{kind:'fruit'}),/正文/);
 assert.throws(()=>prepareNovelProject({fileName:'空.txt',content:''}),/正文/);
 assert.throws(()=>appendPreparedProject({fruitProjects:[p]},p),/已存在/);
});

test('attaching a novel to a finished import enters adaptation while preserving the old manuscript and versions',()=>{
 const p=prepareCompletedProject({fileName:'已完成.txt',content:'第1集\n1-1 日 内\n阿舟：旧正文。'},{kind:'ip'});
 const original=p.episodes[1].scriptText,oldVersion=p.episodes[1].ipVersions[0];
 const next=importIPNovel(appendPreparedProject(createInitialState(),p),p.id,{name:'小说.txt',content:'第一章\n阿舟：原著对白。'});
 const imported=next.fruitProjects[0];
 assert.equal(imported.creator.ip.completedImport,false);
 assert.equal(imported.episodes[1].scriptText,original);assert.ok(imported.episodes[1].ipVersions.some(v=>v.id===oldVersion.id&&v.content===oldVersion.content));
 assert.equal(imported.creator.directImport.content,p.creator.directImport.content);assert.equal(imported.episodes[1].stale,true);assert.equal(imported.episodes[1].finalConfirmed,false);
});
