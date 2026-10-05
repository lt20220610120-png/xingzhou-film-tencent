import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIPPlanAuditPrompt} from './ipPlanAuditPrompt.js';

const lines=['甲先收到医院来信。','甲告知乙病情并同意治疗。','乙安排了医院床位。','甲到达医院并听见门后动静。','门开后乙出示真实诊断。','未选支线：丙仍在远处购物。'];
const source={content:lines.join('\n'),chapters:[{id:'chapter-1',title:'第501章 原著完整场面',start:0,end:lines.join('\n').length}]};
const episode=i=>({chapterIds:['chapter-1'],outline:`已发生动作${i+1}：${lines[i]}`,sourceRanges:[{start:source.content.indexOf(lines[i]),end:source.content.indexOf(lines[i])+lines[i].length}],sourceQuotes:[{startQuote:lines[i],endQuote:lines[i]}]});
const input={source,group:[episode(3),episode(4)],previous:[episode(0),episode(1),episode(2)],window:{start:0,end:source.content.length},segment:{from:1,to:1,episodes:50,focus:'就医主线'},planned:{mainline:'发现疾病到完成就医',ending:'原著已有诊断停点',segments:[]},gapEvidence:'已核实可省的支线事实：丙购物与就医无因果关系。',closesWindow:false};
const evidence=prompt=>JSON.parse(prompt.match(/【已核实分集与逐段完整证据JSON】\n([^\n]+)/)?.[1]||'null');

test('audit uses global episode numbers for candidates and the previous two episodes',()=>{
 const data=evidence(buildIPPlanAuditPrompt(input));
 assert.deepEqual(data?.candidateEpisodes.map(e=>e.globalNumber),[4,5]);
 assert.deepEqual(data.previousEpisodes.map(e=>e.globalNumber),[2,3]);
 assert.equal(data.previousEpisodeEvidence.globalNumber,3);
});
test('candidate evidence is the exact selected UTF-16 slice and retains the actual novel chapter label',()=>{
 const data=evidence(buildIPPlanAuditPrompt(input));
 for(const [i,episode] of data?.candidateEpisodes.entries()||[]){
  const selected=episode.selectedEvidence[0],range=input.group[i].sourceRanges[0];
  assert.deepEqual(selected.range,range);
  assert.equal(selected.raw,source.content.slice(range.start,range.end));
  assert.deepEqual(selected.chapters,[{id:'chapter-1',title:'第501章 原著完整场面'}]);
  assert.ok(!selected.raw.includes('未选支线'));
 }
 assert.equal(data?.candidateEpisodes.length,2);
 assert.equal(data.previousEpisodeEvidence.selectedEvidence[0].raw,lines[2]);
});
test('local source verification cannot be overturned by model arithmetic or imagined offsets',()=>{
 const prompt=buildIPPlanAuditPrompt(input);
 assert.match(prompt,/本地已逐字核实/);
 assert.match(prompt,/禁止自行计算、猜测或改写 UTF-16 偏移/);
 assert.match(prompt,/辅助上下文，不是本集已发生事件/);
 assert.match(prompt,/不得把辅助原文中的未选事件移入本批/);
});
test('an unfinished window permits cross-episode suspense and never requires future allocations to happen already',()=>{
 const prompt=buildIPPlanAuditPrompt(input);
 assert.match(prompt,/本窗口仍有后续分集份额/);
 assert.match(prompt,/允许悬念、问题、门后动静等在后续分集兑现/);
 assert.match(prompt,/不审核尚未分配的未来分集/);
 assert.match(prompt,/不能凭“若”“可能”“需确认”/);
 assert.match(prompt,/明确已经发生/);
});
test('closing a source window still cannot demand an invented payoff or certify a speculative mismatch',()=>{
 const prompt=buildIPPlanAuditPrompt({...input,closesWindow:true});
 assert.match(prompt,/本窗口的分集份额已安排完/);
 assert.match(prompt,/并不表示故事单元或全剧必须在此结束/);
 assert.match(prompt,/必须指出全局集号/);
 assert.match(prompt,/逐字证据/);
 assert.match(prompt,/只返回短JSON/);
 assert.ok(!prompt.includes('本窗口仍有后续分集份额'));
});
test('invalid or absent supposedly verified source cuts fail before creating an audit prompt',()=>{
 assert.throws(()=>buildIPPlanAuditPrompt({...input,group:[{...episode(3),sourceRanges:[{start:0,end:source.content.length+1}]}]}),/原文片段位置无效/);
 assert.throws(()=>buildIPPlanAuditPrompt({...input,group:[{...episode(3),sourceRanges:[]}]}),/原文片段为空/);
});
test('current planner group envelopes and explicit context fields preserve identical numbered evidence',()=>{
 const plain=evidence(buildIPPlanAuditPrompt(input));
 const wrapped=buildIPPlanAuditPrompt({...input,group:{episodes:input.group},mainline:'显式主线',ending:'显式停点',window:undefined,windowEvidence:'显式辅助窗口',nextSegment:{from:2,to:2,episodes:2},gapEvidence:{summary:'已核实跳过事实'}});
 assert.deepEqual(evidence(wrapped),plain);
 assert.match(wrapped,/全剧主线：显式主线/);
 assert.match(wrapped,/原著真实终点：显式停点/);
 assert.match(wrapped,/显式辅助窗口/);
 assert.match(wrapped,/已核实跳过事实/);
});
test('multiple selected slices retain exact punctuation, Unicode and gaps instead of widening to a chapter',()=>{
 const content='前史🙂甲说：“我同意。”\n可省支线🚀\n甲走进诊室。尾声';
 const unicodeSource={content,chapters:[{id:'u',title:'第502章 逐句切点',start:0,end:content.length}]};
 const a={start:content.indexOf('甲说'),end:content.indexOf('\n')},b={start:content.indexOf('甲走进'),end:content.indexOf('尾声')};
 const selected={chapterIds:['u'],outline:'甲同意后进入诊室。',sourceRanges:[a,b]};
 const data=evidence(buildIPPlanAuditPrompt({...input,source:unicodeSource,group:[selected],previous:[],window:{start:0,end:content.length}}));
 assert.deepEqual(data.candidateEpisodes[0].selectedEvidence.map(r=>r.raw),['甲说：“我同意。”','甲走进诊室。']);
 assert.deepEqual(data.candidateEpisodes[0].selectedEvidence.map(r=>r.range),[a,b]);
 assert.equal(data.previousEpisodeEvidence,null);
 assert.equal(data.candidateEpisodes[0].globalNumber,1);
});
test('compact outline omissions cannot erase a causal transition already contained in the selected complete raw evidence',()=>{
 const content='甲拿到文件后离开办公室。甲沿走廊走到教室。甲推门交出文件。';
 const causalSource={content,chapters:[{id:'cause',title:'第503章 真实因果',start:0,end:content.length}]};
 const selected={chapterIds:['cause'],outline:'甲进门交出文件。',sourceRanges:[{start:0,end:content.length}]};
 const prompt=buildIPPlanAuditPrompt({...input,source:causalSource,group:[selected],previous:[],window:{start:0,end:content.length}});
 const data=evidence(prompt);
 assert.ok(!data.candidateEpisodes[0].outline.includes('走到教室'));
 assert.ok(data.candidateEpisodes[0].selectedEvidence[0].raw.includes('甲沿走廊走到教室。'));
 assert.match(prompt,/细纲是紧凑提纲，不是最终正文/);
 assert.match(prompt,/提纲未逐句列出某个动作或对白，不等于正文会删掉/);
 assert.match(prompt,/后续正文会完整回读 selectedEvidence.raw/);
 assert.match(prompt,/不能因180字细纲简写未逐句呈现而判定事实缺失/);
 assert.match(prompt,/关键前因不在前文原文 \+ 当前 selectedEvidence.raw \+ 有效跳过区间事实证据/);
});
