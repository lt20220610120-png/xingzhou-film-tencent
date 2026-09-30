import test from 'node:test';
import assert from 'node:assert/strict';
import {matchBasicReferences, removeGenerationReference, projectReferenceCandidates, selectionAfterPromptEdit} from './automaticReferences.js';
import {entryValue, mergeEpisodeMedia, parsePromptBook, saveEntryValue} from './promptBook.js';

const image=(id,name)=>({id,name,kind:'image',filePath:`C:/media/${id}.png`});
const audio=(id,name)=>({id,name,kind:'audio',filePath:`C:/media/${id}.wav`});
const options={allowedKinds:['image','audio','video']};
const prompt='1-5-1\n【基础设定】\n人物：苏洲（参考@），穿居家便装；林清雪（参考@），穿校服；Q版林清雪，内心形象。\n场景：清晨，出租屋厨房内（参考@）；有晨光。\n道具：三明治两个（盛在盘中）；林清雪的书包（在房门边）。\n音色：苏洲，成年男声；林清雪，少女声线。\n【整体视觉】\n其他人物张三在场外，提到卧室。';

test('basic subjects bind named local media, variants, locations, props and voices at their own fields',()=>{
 const refs=[image('lin','001-【林清雪-校服】.png'),image('kitchen','002-【出租屋厨房】.png'),image('su','006-【苏洲-日常】.png'),image('q','187-【Q版的林清雪】.png'),image('bag','林清雪的书包.png'),image('sandwich','三明治.png'),audio('voice','苏洲.wav'),image('other','张三.png'),image('room','卧室.png')];
 const next=matchBasicReferences({prompt,references:refs},refs,options);
 assert.match(next.prompt,/苏洲（参考@image3）/);
 assert.match(next.prompt,/林清雪（参考@image1）/);
 assert.match(next.prompt,/Q版林清雪（参考@image4）/);
 assert.match(next.prompt,/出租屋厨房内（参考@image2）/);
 assert.match(next.prompt,/三明治两个（参考@image6）（盛在盘中）/);
 assert.match(next.prompt,/林清雪的书包（参考@image5）/);
 assert.match(next.prompt,/音色：苏洲（参考@audio1），成年男声；林清雪，少女声线/);
 assert.doesNotMatch(next.prompt,/@image[789]/);
 assert.equal(next.references.length,refs.length);
 assert.strictEqual(matchBasicReferences(next,refs,options),next);
});

test('same-name images and audios all bind, and no uploaded audio leaves a voice untouched',()=>{
 const refs=[image('a','苏洲.png'),image('b','苏洲.png'),audio('c','苏洲.mp3'),audio('d','苏洲.wav')];
 const next=matchBasicReferences({prompt:'【基础设定】\n人物：苏洲（参考@）。\n音色：苏洲（参考@）；林清雪，轻声。',references:[]},refs,options);
 assert.equal(next.references.length,4);
 assert.match(next.prompt,/人物：苏洲（参考@image1 @image2）/);
 assert.match(next.prompt,/音色：苏洲（参考@audio1 @audio2）；林清雪，轻声/);
});

test('only basic fields create matches, ordinary prose and unsupported audio create none',()=>{
 const refs=[image('a','苏洲.png'),audio('b','苏洲.wav')];
 assert.equal(matchBasicReferences({prompt:'苏洲在厨房说话',references:[]},refs,options).references.length,0);
 const next=matchBasicReferences({prompt:'【基础设定】\n人物：苏洲。\n音色：苏洲。\n【分镜】\n苏洲',references:[]},refs,{allowedKinds:['image']});
 assert.deepEqual(next.references.map(r=>r.id),['a']);
 assert.doesNotMatch(next.prompt,/@audio/);
});

test('removing a matched item renumbers aliases by identity and keeps exclusion after reopening or importing',()=>{
 const refs=[image('a','苏洲.png'),image('b','林清雪.png'),image('c','苏洲.png')];
 const first=matchBasicReferences({prompt:'【基础设定】\n人物：苏洲（参考@）；林清雪（参考@）。',references:refs},refs,options);
 const removed=removeGenerationReference(first,'image:a',options);
 assert.match(removed.prompt,/苏洲（参考@image2）；林清雪（参考@image1）/);
 const next=matchBasicReferences(JSON.parse(JSON.stringify(removed)),[...refs,image('d','苏洲.png')],options);
 assert.deepEqual(next.references.map(r=>r.id),['b','c','d']);
 assert.match(next.prompt,/苏洲（参考@image2 @image3）/);
 assert.ok(!next.references.some(r=>r.id==='a'));
});

test('editing descriptive text or deleting an auto tag does not continually overwrite manual edits',()=>{
 const refs=[image('a','苏洲.png')];
 const first=matchBasicReferences({prompt:'【基础设定】\n人物：苏洲（参考@），穿蓝衣。',references:refs},refs,options);
 const edited={...first,prompt:first.prompt.replace('（参考@image1）','').replace('蓝衣','白衣')};
 assert.strictEqual(matchBasicReferences(edited,refs,options),edited);
 const renamed={...edited,prompt:edited.prompt.replace('苏洲','林清雪')};
 const next=matchBasicReferences(renamed,[...refs,image('b','林清雪.png')],options);
 assert.match(next.prompt,/林清雪（参考@image2），穿白衣/);
});

test('model changes remove unsupported aliases and restore voice binding on a supported model',()=>{
 const refs=[audio('a','苏洲.wav'),image('b','苏洲.png')];
 const first=matchBasicReferences({prompt:'【基础设定】\n人物：苏洲。\n音色：苏洲。',references:refs},refs,options);
 const hidden=matchBasicReferences(first,refs,{allowedKinds:['image']});
 assert.doesNotMatch(hidden.prompt,/@audio/);
 assert.equal(hidden.references.length,2);
 assert.match(matchBasicReferences(hidden,refs,options).prompt,/音色：苏洲（参考@audio1）/);
});

test('project pool contains every image for the selected episode and only that episode media',()=>{
 const assets=[{id:'a',name:'苏洲',category:'character',episodes:[1,2],images:[{id:'i',url:'https://x/1'},{id:'j',url:'https://x/2'}]},{id:'b',name:'苏洲',category:'character',episodes:[2],images:[{id:'k',url:'https://x/3'}]}];
 const pool=projectReferenceCandidates(assets,[{id:'v',kind:'audio',episode:1,filename:'苏洲.wav',url:'https://x/v'},{id:'w',kind:'audio',episode:2,filename:'苏洲.wav',url:'https://x/w'}],'p',1);
 assert.deepEqual(pool.map(r=>r.id),['i','j','v']);
 assert.equal(pool[0].assetId,'a');assert.equal(pool[0].imageId,'i');assert.equal(pool[0].projectId,'p');
 const next=matchBasicReferences({prompt:'【基础设定】\n人物：苏洲。\n音色：苏洲。',references:[]},pool,options);
 assert.equal(next.references.length,3);
});

test('automatic annotations and exclusions stay per prompt entry, not shared across an episode',()=>{
 const refs=[image('a','苏洲.png'),image('b','苏洲.png')];
 let book=mergeEpisodeMedia(parsePromptBook('【1-1-1】【基础设定】\n人物：苏洲。【1-1-2】【基础设定】\n人物：苏洲。','书','book'),{1:refs});
 const [a,b]=book.entries;
 const first=matchBasicReferences(entryValue(book,a),refs,options);
 book=saveEntryValue(book,a.id,removeGenerationReference(first,'image:a',options));
 book=JSON.parse(JSON.stringify(book));
 assert.deepEqual(entryValue(book,a).references.map(r=>r.id),['b']);
 assert.deepEqual(matchBasicReferences(entryValue(book,b),refs,options).references.map(r=>r.id),['a','b']);
 assert.doesNotMatch(matchBasicReferences(entryValue(book,a),refs,options).prompt,/@image2/);
});

test('upgrading a book preserves references removed before automatic matching existed',()=>{
 const refs=[image('a','苏洲.png'),image('b','苏洲.png')];
 let book=mergeEpisodeMedia(parsePromptBook('【1-1-1】【基础设定】\n人物：苏洲。','旧项目','old'),{1:refs});
 const entry=book.entries[0];
 book=saveEntryValue(book,entry.id,{...entryValue(book,entry),references:[refs[1]]});
 const next=matchBasicReferences(entryValue(book,entry),refs,options);
 assert.deepEqual(next.references.map(r=>r.id),['b']);
});

test('category and longer subject names prevent owned props or Q-version assets binding to the wrong person',()=>{
 const refs=[{...image('a','林清雪的书包.png'),category:'prop'},image('b','Q版的林清雪.png'),image('c','林清雪.png')];
 const next=matchBasicReferences({prompt:'【基础设定】\n人物：林清雪；Q版林清雪。\n道具：林清雪的书包。',references:refs},refs,options);
 assert.match(next.prompt,/人物：林清雪（参考@image3）；Q版林清雪（参考@image2）/);
 assert.match(next.prompt,/道具：林清雪的书包（参考@image1）/);
});

test('name prefixes do not mistake owned props or relatives for a person; compact wardrobe suffixes still match',()=>{
 const refs=[image('a','林清雪.png'),image('b','林清雪的书包.png'),image('c','苏洲.png'),{...image('d','苏洲妈妈.png'),category:'character'},image('e','苏洲校服.png'),image('f','林清雪-日常.png')];
 const next=matchBasicReferences({prompt:'【基础设定】\n人物：林清雪；苏洲。',references:[]},refs,options);
 assert.deepEqual(next.references.map(r=>r.id),['a','c','e','f']);
 assert.match(next.prompt,/林清雪（参考@image1 @image4）；苏洲（参考@image2 @image3）/);
});

test('existing manual aliases and parentheses are retained while matching fills missing references',()=>{
 const refs=[image('a','苏洲.png'),image('b','苏洲.png'),image('c','手动图.png')];
 const next=matchBasicReferences({prompt:'【基础设定】\n人物：苏洲（参考@image3），（动作；情绪）全部保留。\n道具：无。',references:refs},refs,options);
 assert.match(next.prompt,/苏洲（参考@image3 @image1 @image2），（动作；情绪）全部保留/);
});

test('auto edits map a caret near the changed subject instead of moving it to the end of the script',()=>{
 const text='【基础设定】\n人物：苏洲（参考@），穿蓝衣；林清雪（参考@），穿校服。\n【整体视觉】\n保留原文。';
 let selection={start:text.indexOf('苏洲')+2,end:text.indexOf('苏洲')+2};
 const next=matchBasicReferences({prompt:text,references:[]},[image('a','苏洲.png'),image('b','苏洲.png'),image('c','林清雪.png')],{...options,onPromptEdit:edit=>{selection=selectionAfterPromptEdit(selection,edit);}});
 assert.equal(next.prompt.slice(0,selection.start).endsWith('苏洲'),true);
 assert.ok(selection.start<next.prompt.indexOf('【整体视觉】'));
 const atEnd={start:text.length,end:text.length};
 let tail=atEnd;
 matchBasicReferences({prompt:text,references:[]},[image('a','苏洲.png')],{...options,onPromptEdit:edit=>{tail=selectionAfterPromptEdit(tail,edit);}});
 assert.equal(tail.start,text.length+'（参考@image1）'.length-'（参考@）'.length);
});
