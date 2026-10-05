import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNovel } from './ipWorkspace.js';
import { groundIPPlanEpisodes } from './ipPlanGrounding.js';

const opening='秦川推开旧车站大门，发现妹妹独自站在雨里。';
const stop='妹妹交出父亲留下的信封，两人决定先去医院。';
const secondStart='两人在医院走廊遇见值班医生，得知父亲刚刚苏醒。';
const secondStop='父亲确认信封里的地址，嘱咐他们明天乘船出发。';
const nextStart='清晨的渡船驶离港口，秦川在甲板上辨认信中暗号。';
const nextStop='船长指向远处孤岛，秦川终于确定下一处调查地点。';
const unrelated='邻居在菜市场挑选蔬菜，闲聊今天白菜的价格。';
const finalStart='兄妹抵达孤岛码头，发现信中地址就是眼前的灯塔。';
const finalStop='灯塔管理员交出旧照片，确认父亲失踪前确实来过。';
const source=()=>parseNovel(`第501章 旧站\r\n${opening}\r\n${stop}\r\n${secondStart}\r\n${secondStop}\r\n第502章 渡海\r\n${nextStart}\r\n${nextStop}\r\n第503章 无关支线\r\n${unrelated}\r\n第504章 孤岛\r\n${finalStart}\r\n${finalStop}\r\n`,'fiction');
const episode=(s,chapter,startQuote,endQuote,outline='真实场面转写')=>({chapterIds:[s.chapters[chapter].id],outline,sourceQuotes:[{startQuote,endQuote}]});
const ground=(episodes,s,options)=>groundIPPlanEpisodes({mainline:'信封线索调查',ending:'获得照片',notes:'保留因果',episodes},s,options);
const codeIs=code=>error=>error.code===code;

test('grounds exact chapter-internal cuts, preserving plan and episode metadata',()=>{
 const s=source(),input={...episode(s,0,opening,stop,'第501章：兄妹在旧站取得信封，决定去医院。'),title:'旧站来信',segmentId:'segment-1'};
 const result=ground([input],s,{expectedCount:1});
 assert.equal(result.mainline,'信封线索调查');assert.equal(result.ending,'获得照片');assert.equal(result.notes,'保留因果');
 assert.equal(result.episodes[0].title,'旧站来信');assert.equal(result.episodes[0].segmentId,'segment-1');
 assert.deepEqual(result.episodes[0].sourceRanges,[{start:s.content.indexOf(opening),end:s.content.indexOf(stop)+stop.length}]);
 assert.notEqual(result.episodes[0].sourceRanges[0].start,s.chapters[0].start);
 assert.notEqual(result.episodes[0].sourceRanges[0].end,s.chapters[0].end);
 assert.equal(input.sourceRanges,undefined,'does not mutate model input');
});

test('allows distinct consecutive scenes in one chapter and omitted irrelevant chapters',()=>{
 const s=source();
 const first=ground([episode(s,0,opening,stop)],s).episodes;
 const result=ground([episode(s,0,secondStart,secondStop),episode(s,1,nextStart,nextStop),episode(s,3,finalStart,finalStop)],s,{previous:first});
 assert.equal(result.episodes.length,3);assert.deepEqual(result.episodes.at(-1).chapterIds,[s.chapters[3].id]);
});

test('rejects the actual class of episode 3/4 overlapping scenes',()=>{
 const s=source(),first=episode(s,0,opening,stop),second=episode(s,0,opening,secondStop);
 assert.throws(()=>ground([first,second],s),error=>error.code==='IP_PLAN_SOURCE_OVERLAP'&&/第 2 集.*第 1 集/.test(error.message));
 const previous=ground([first],s).episodes;
 assert.throws(()=>ground([second],s,{previous}),codeIs('IP_PLAN_SOURCE_OVERLAP'));
});

test('rejects source cuts that go backwards even without an overlap',()=>{
 const s=source(),previous=ground([episode(s,1,nextStart,nextStop)],s).episodes;
 assert.throws(()=>ground([episode(s,0,opening,stop)],s,{previous}),error=>error.code==='IP_PLAN_SOURCE_OVERLAP'&&/倒退/.test(error.message));
});

test('requires true anchors in the declared chapter, not an unrelated later event',()=>{
 const s=source();
 assert.throws(()=>ground([episode(s,0,nextStart,nextStop)],s),codeIs('IP_PLAN_SOURCE_MISMATCH'));
 assert.throws(()=>ground([episode(s,1,finalStart,finalStop,'第502章：船长告诉秦川孤岛的位置。')],s),codeIs('IP_PLAN_SOURCE_MISMATCH'));
 const narrowed={start:s.content.indexOf(nextStart),end:s.content.indexOf(nextStop)};
 assert.throws(()=>ground([episode(s,1,nextStart,nextStop)],s,{allowedRanges:[narrowed]}),codeIs('IP_PLAN_SOURCE_MISMATCH'));
});

test('uses actual novel chapter numbers rather than sequential imported IDs',()=>{
 const s=source();
 assert.throws(()=>ground([episode(s,0,opening,stop,'第502章：兄妹在旧站取得信封。')],s),error=>error.code==='IP_PLAN_SOURCE_MISMATCH'&&/第 502 章/.test(error.message));
 assert.throws(()=>ground([episode(s,0,opening,stop,'来源第1章：兄妹取得信封。')],s),codeIs('IP_PLAN_SOURCE_MISMATCH'));
 assert.doesNotThrow(()=>ground([episode(s,0,opening,stop,'原文第501章：兄妹取得信封。下一集第502章冲突引子。')],s));
 assert.doesNotThrow(()=>ground([episode(s,0,opening,stop,'兄妹取得信封。接点：下一集转入原文第502章。')],s));
 const chinese=parseNovel(`第五百零一章 来信\n${opening}\n${stop}`,'chinese');
 assert.doesNotThrow(()=>ground([episode(chinese,0,opening,stop,'来源第五百零一章：取得信封。')],chinese));
});

test('numeric offsets must match anchors exactly; no guessed range is accepted',()=>{
 const s=source(),e=episode(s,0,opening,stop),expected={start:s.content.indexOf(opening),end:s.content.indexOf(stop)+stop.length};
 assert.deepEqual(ground([{...e,sourceRanges:[expected]}],s).episodes[0].sourceRanges,[expected]);
 assert.throws(()=>ground([{...e,sourceRanges:[{start:s.chapters[0].start,end:s.chapters[0].end}]}],s),error=>error.code==='IP_PLAN_SOURCE_MISMATCH'&&/不一致/.test(error.message));
 assert.throws(()=>ground([{...e,sourceRanges:[]}],s),codeIs('IP_PLAN_SOURCE_MISMATCH'));
});

test('rejects missing, short or fabricated anchors with actionable codes',()=>{
 const s=source(),e=episode(s,0,opening,stop);
 assert.throws(()=>ground([{chapterIds:e.chapterIds,outline:e.outline}],s),codeIs('IP_PLAN_MISSING_ANCHOR'));
 assert.throws(()=>ground([{...e,sourceQuotes:[{startQuote:'推门。',endQuote:stop}]}],s),codeIs('IP_PLAN_MISSING_ANCHOR'));
 assert.throws(()=>ground([{...e,sourceQuotes:[{startQuote:'秦川推开学校大门，发现妹妹独自站在雨里。',endQuote:stop}]}],s),codeIs('IP_PLAN_SOURCE_MISMATCH'));
 assert.throws(()=>ground([e],s,{expectedCount:3}),codeIs('IP_PLAN_SOURCE_MISMATCH'));
});

test('accepts a complete short original sentence when it uniquely locates the scene',()=>{
 const short='翌日清晨，早晨六点半。',stop='秦川拿起信封走出大门，准备按父亲留下的地址寻找妹妹。';
 const s=parseNovel(`第1章 出发\n${short}\n${stop}\n`,'short-original');
 const result=ground([episode(s,0,short,stop)],s);
 assert.deepEqual(result.episodes[0].sourceRanges,[{start:s.content.indexOf(short),end:s.content.indexOf(stop)+stop.length}]);
 const minimal='雨停了。',later=parseNovel(`第1章 等雨\n${minimal}\n${stop}\n`,'minimal-original');
 assert.doesNotThrow(()=>ground([episode(later,0,minimal,stop)],later));
});

test('short original anchors still require a unique match inside the declared allowed source',()=>{
 const short='雨停了。',s=parseNovel(`第1章 等雨\n${short}\n${opening}\n${short}\n${stop}\n第2章 出发\n翌日清晨，早晨六点半。\n${nextStop}\n`,'short-ambiguous');
 assert.throws(()=>ground([episode(s,0,short,stop)],s),error=>error.code==='IP_PLAN_SOURCE_MISMATCH'&&/重复/.test(error.message));
 assert.throws(()=>ground([episode(s,0,'翌日清晨，早晨六点半。',stop)],s),codeIs('IP_PLAN_SOURCE_MISMATCH'));
 assert.throws(()=>ground([episode(s,1,'翌日清晨，早晨六点半。',nextStop)],s,{allowedRanges:[{start:s.chapters[0].start,end:s.chapters[0].end}]}),codeIs('IP_PLAN_SOURCE_MISMATCH'));
});

test('rejects ambiguous start and end quotes rather than expanding to a chapter',()=>{
 const s=parseNovel(`第1章 重复\n${opening}\n${stop}\n${stop}\n${opening}\n`,'ambiguous');
 assert.throws(()=>ground([episode(s,0,opening,stop)],s),error=>error.code==='IP_PLAN_SOURCE_MISMATCH'&&/重复/.test(error.message));
 const uniqueStart=parseNovel(`第1章 重复止句\n${opening}\n${stop}\n${stop}\n`,'end-repeat');
 assert.throws(()=>ground([episode(uniqueStart,0,opening,stop)],uniqueStart),error=>error.code==='IP_PLAN_SOURCE_MISMATCH'&&/止句.*重复/.test(error.message));
});

test('normalizes whitespace only while preserving exact Unicode UTF-16 source offsets',()=>{
 const start='秦川在雨里抬头看见🚢渡船，终于等到了久别的妹妹。';
 const end='妹妹递来一张旧照片，指着灯塔说这就是父亲的去处。';
 const content=`第1章 等待\r\n${start.slice(0,9)} \r\n${start.slice(9)}\r\n${end.slice(0,12)}\t${end.slice(12)}`;
 const s=parseNovel(content,'unicode'),result=ground([episode(s,0,start,end)],s);
 assert.deepEqual(result.episodes[0].sourceRanges,[{start:content.indexOf('秦川'),end:content.length}]);
 assert.equal(content.slice(result.episodes[0].sourceRanges[0].start).replace(/\s/g,''),`${start}${end}`);
});

test('rejects repeated long narrative but ignores generic retention instructions',()=>{
 const s=source(),duplicate='兄妹在旧站取得父亲的来信后决定共同前往医院调查父亲失踪的真实原因并找回关键照片';
 assert.throws(()=>ground([episode(s,0,opening,stop,duplicate),episode(s,0,secondStart,secondStop,duplicate)],s),error=>error.code==='IP_PLAN_SOURCE_OVERLAP'&&/重复安排/.test(error.message));
 const generic='必留：完整保留原著对白以及人物的动作细节和心声，不得虚构剧情也不得省略关键因果。删减：与本条主线完全无关的支线、重复景物描写以及泛泛的背景解释。';
 assert.doesNotThrow(()=>ground([episode(s,0,opening,stop,`兄妹取得来信。${generic}`),episode(s,0,secondStart,secondStop,`父亲交代航程。${generic}`)],s));
});

test('permits adjacent explicitly quoted cuts and selected ranges crossing declared chapters',()=>{
 const s=source(),e={...episode(s,0,opening,stop),sourceQuotes:[{startQuote:opening,endQuote:stop},{startQuote:secondStart,endQuote:secondStop}]};
 assert.equal(ground([e],s).episodes[0].sourceRanges.length,2);
 const crossing={chapterIds:[s.chapters[0].id,s.chapters[1].id],outline:'父亲交代后兄妹乘船。',sourceQuotes:[{startQuote:secondStart,endQuote:nextStop}]};
 assert.deepEqual(ground([crossing],s).episodes[0].chapterIds,[s.chapters[0].id,s.chapters[1].id]);
 assert.throws(()=>ground([crossing],s,{allowedRanges:[{start:s.chapters[0].start,end:s.chapters[0].end}]}),codeIs('IP_PLAN_SOURCE_MISMATCH'));
});

test('legacy inspection may explicitly accept numeric cuts, but never invents whole chapter cuts',()=>{
 const s=source(),ranges=[{start:s.content.indexOf(opening),end:s.content.indexOf(stop)+stop.length}];
 assert.deepEqual(ground([{chapterIds:[s.chapters[0].id],outline:'旧站来信',sourceRanges:ranges}],s,{requireAnchors:false}).episodes[0].sourceRanges,ranges);
 assert.throws(()=>ground([{chapterIds:[s.chapters[0].id],outline:'旧站来信'}],s,{requireAnchors:false}),codeIs('IP_PLAN_SOURCE_MISMATCH'));
 assert.throws(()=>ground([episode(s,0,opening,stop)],s,{previous:[{chapterIds:[s.chapters[0].id],outline:'未知切点'}]}),codeIs('IP_PLAN_MISSING_ANCHOR'));
});
