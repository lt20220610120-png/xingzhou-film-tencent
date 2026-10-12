import { parseDirectorDialogues, countDialogueCharacters } from './directorDialogue.js';
import { validateScenePlan, assertDurationLimit } from './directorSegmentation.js';
import { getDirectorSegmentTimingFacts, extractDirectorVisualBeats } from './directorTiming.js';
import { directorSpeechBoundary } from './directorSpeechBoundaries.js';

const round = n => Math.round(n * 1e6) / 1e6;
const fields = ['speechSeconds', 'actionSeconds', 'transitionSeconds'];

/** Repack source-grounded performance beats, never stretch them to fill a clip.
 * Speech is charged to audible characters; exclusive action time to completed
 * visual beats, not descriptive word count. Overlap already runs under speech.
 * An indivisible action that cannot fit is left to the planner for correction.
 */
export function packScenePlan(candidate, { tape, maxDurationSeconds, optimizeUnderfilled = true } = {}) {
  const unchanged = { candidate, changed: false };
  const initial = validateScenePlan(candidate, { tape, maxDurationSeconds, groundedTiming: true });
  if ((initial.ok && optimizeUnderfilled !== 'segment-count' && (!optimizeUnderfilled || !initial.warnings?.length)) || !initial.issues.every(i => ['UNDERFILLED_SEGMENT', 'DURATION_EXCEEDED', 'SPEECH_CAPACITY_EXCEEDED', 'INCOMPLETE_DIALOGUE_BOUNDARY'].includes(i.code) || (i.code === 'INVALID_TIMING' && i.message === '片段估计时长必须大于零'))) return unchanged;
  const durationLimit = assertDurationLimit(maxDurationSeconds);
  const dialogueRecords=parseDirectorDialogues(tape.sourceText),visualBeats=extractDirectorVisualBeats(tape.sourceText);
  const events = [], spans = [];
  let start = 0;
  for (const segment of candidate.segments) {
    const unit = tape.units.find(u => u.id === segment.end.unitId);
    const end = segment.end.prefix === undefined ? unit.end : unit.start + segment.end.prefix.length;
    const facts = getDirectorSegmentTimingFacts({ sourceText: tape.sourceText, sourceStart: start, sourceEnd: end, dialogues:dialogueRecords, visualBeats });
    const audible = facts.dialogues.flatMap(d => d.ranges.flatMap(range => [...tape.sourceText.slice(range.start, range.end).matchAll(/[\p{L}\p{N}]/gu)].map(m => range.start + m.index + m[0].length)));
    // Keep cumulative allocation exact even for fractional speech rates.
    audible.forEach((position, i) => events.push({ position, field: 'speechSeconds', amount: round(segment.timing.speechSeconds * (i + 1) / audible.length) - round(segment.timing.speechSeconds * i / audible.length) }));
    if (!audible.length && segment.timing.speechSeconds) return unchanged;
    const weightedCues = facts.actionCues.filter(beat => beat.category !== 'environment' && beat.category !== 'sound-effect');
    const actionEnds = weightedCues.map(beat => beat.sourceEnd);
    // Gestures accompanying a line have no standalone △ cue. Their residual
    // exclusive time belongs to the end of that performance, never a new event.
    if (!actionEnds.length) actionEnds.push(end);
    const exclusive = round(segment.timing.actionSeconds - segment.timing.overlapSeconds);
    const weights = weightedCues.map(beat => Math.max(0, (beat.seconds ?? 2.5) - beat.overlapSeconds));
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    let allocated = 0;
    actionEnds.forEach((position, i) => {
      const amount = weightTotal ? exclusive * weights[i] / weightTotal : exclusive / actionEnds.length;
      // Keep the rounded allocation monotonic and within the original budget.
      // A zero-weight last cue must never receive a negative rounding residue.
      const next = i === actionEnds.length - 1 ? exclusive : Math.min(exclusive, round(allocated + amount));
      events.push({ position, field: 'actionSeconds', amount: round(next - allocated) }); allocated = next;
    });
    events.push({ position: end, field: 'transitionSeconds', amount: segment.timing.transitionSeconds });
    spans.push({ start, end, segment }); start = end;
  }
  events.sort((a,b) => a.position - b.position);
  const boundaries = new Set([tape.sourceText.length, ...tape.units.map(unit => unit.end)]);
  // Spoken word positions allocate exact speech time, but they are not cut
  // positions. Only a complete turn or a full sentence of a long turn may cut.
  const wordEnds = new Set();
  for (const part of new Intl.Segmenter('zh', { granularity: 'word' }).segment(tape.sourceText)) {
    wordEnds.add(part.index); wordEnds.add(part.index + part.segment.length);
  }
  // Complete short turns are indivisible, so their internal word positions
  // are never useful candidates. Only long turns can cut at sentence ends.
  for(const dialogue of dialogueRecords.filter(row=>countDialogueCharacters(row.speech)/4>durationLimit)){
    for(const range of dialogue.ranges){
      for(const match of tape.sourceText.slice(range.start,range.end).matchAll(/[。！？!?](?:[”』」’"）)]*)/gu))boundaries.add(range.start+match.index+match[0].length);
    }
  }
  for (const span of spans) boundaries.add(span.end);
  for (const beat of visualBeats) boundaries.add(beat.sourceEnd);
  // Closing punctuation belongs to the preceding words. A lexical boundary
  // just before "！" is legal to Segmenter but cannot form a new performance.
  const options=[...boundaries].filter(end=>end>0&&wordEnds.has(end)&&(end===tape.sourceText.length||! /^[\p{P}\p{S}]/u.test(tape.sourceText.slice(end)))
    && directorSpeechBoundary({sourceText:tape.sourceText,sourceEnd:end,maxDurationSeconds:durationLimit,dialogues:dialogueRecords}).ok).sort((a,b)=>a-b);
  const cumulative=new Map(); let cursor=0; const sum={speechSeconds:0,actionSeconds:0,transitionSeconds:0};
  cumulative.set(0,{...sum});
  for(const end of options){
    while(cursor<events.length&&events[cursor].position<=end){const event=events[cursor++];sum[event.field]=round(sum[event.field]+event.amount);}
    cumulative.set(end,{...sum});
  }
  const timingFor=(a,b)=>Object.fromEntries([...fields.map(field=>[field,round(cumulative.get(b)[field]-cumulative.get(a)[field])]),['overlapSeconds',0]]);
  const totals=new Map([...cumulative].map(([offset,timing])=>[offset,round(fields.reduce((sum,key)=>sum+timing[key],0))]));
  const totalFor=(a,b)=>round(totals.get(b)-totals.get(a));
  // The furthest legal boundary yields the fewest clips for these additive,
  // nonnegative source timings. A prettier earlier cut may only be chosen
  // when its suffix still fits in the same number of clips.
  const suffixCounts=new Map([[tape.sourceText.length,0]]);
  const countFrom=offset=>{
    if(suffixCounts.has(offset))return suffixCounts.get(offset);
    const trail=[];let start=offset,count;
    while(!suffixCounts.has(start)){
      trail.push(start);
      if(totalFor(start,tape.sourceText.length)<=durationLimit){count=1;break;}
      const next=options.filter(end=>end>start&&totalFor(start,end)>0&&totalFor(start,end)<=durationLimit).at(-1);
      if(!next){count=Infinity;break;}
      start=next;
    }
    count??=suffixCounts.get(start)+1;
    for(const step of trail.reverse()){suffixCounts.set(step,count);count++;}
    return suffixCounts.get(offset);
  };
  const cuts=[];start=0;
  while(start<tape.sourceText.length){
    const remaining=totalFor(start,tape.sourceText.length);
    if(remaining>0&&remaining<=durationLimit){cuts.push(tape.sourceText.length);break;}
    const possible=options.filter(end=>end>start&&end<tape.sourceText.length&&totalFor(start,end)>0&&totalFor(start,end)<=durationLimit);
    if(!possible.length)return unchanged;
    const best=possible.at(-1),minimumTail=countFrom(best);
    const natural=possible.filter(end=>totalFor(start,end)>=durationLimit-2&&countFrom(end)===minimumTail&&(/[。！？!?；;\n]\s*$/.test(tape.sourceText.slice(start,end))||spans.some(s=>s.end===end)));
    const end=(natural.length?natural:possible).at(-1);cuts.push(end);start=end;
  }
  const stateAt = offset => {
    const boundary=spans.find(s=>s.end===offset);
    if(boundary)return boundary.segment.endState;
    return { sourceThrough: tape.sourceText.slice(Math.max(0,offset-400),offset), continuity: '仅继承此原文位置已经发生的人物、持物、伤势与光源状态；未发生的后文不能提前出现。连续台词保持声源，用在场人物反应或已有细节承接，不重说前句。' };
  };
  start=0;
  const segments=cuts.map((end,index)=>{
    const unit=tape.units.find(u=>u.start<end&&u.end>=end);
    const oldEnd=spans.find(s=>s.end===end);
    const packed={
      end:{unitId:unit.id,...(unit.end===end?{}:{prefix:unit.text.slice(0,end-unit.start)})},
      timing:timingFor(start,end),
      startState:index?stateAt(start):candidate.segments[0].startState,endState:stateAt(end),
      boundary:oldEnd?.segment.boundary||{type:'sound-bridge',evidence:tape.sourceText.slice(Math.max(start,end-100),end)},
      visualNotes:spans.filter(s=>s.start>=start&&s.end<=end).flatMap(s=>s.segment.visualNotes),
    };
    start=end;return packed;
  });
  const packed={segments};
  if(!validateScenePlan(packed,{tape,maxDurationSeconds,groundedTiming:true}).ok)return unchanged;
  if(optimizeUnderfilled==='segment-count'&&initial.ok&&segments.length>=candidate.segments.length)return unchanged;
  return {candidate:packed,changed:true,originalSegmentCount:candidate.segments.length,segmentCount:segments.length};
}
