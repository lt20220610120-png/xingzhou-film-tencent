import {durationCapacity,RESEGMENT_DURATION_REASON,validatedDurationEstimate,VIDEO_DURATION_ESTIMATOR_VERSION} from './videoDurationMetadata.js';

const paceRates={slow:[2.5,3.5,3],normal:[3.8,4.5,4],fast:[4.8,5.5,5.2],very_fast:[6,6,6]};
const pauseAnchors={comma:20,end:40,handoff:30};
const invalid=message=>{throw new Error(message);};
const isRecord=value=>value&&typeof value==='object'&&!Array.isArray(value);
const secondsValue=(value,label)=>{
 const numeric=typeof value==='number'||(typeof value==='string'&&/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value.trim()))?Number(value):NaN;
 if(!Number.isFinite(numeric)||numeric<0||numeric>86400)invalid(`${label}不是可计算的秒数`);
 return numeric;
};

// Use the decimal representation of each time and rate to avoid floating-point
// artifacts at hundredth boundaries, including the 15/18/30/35-second edges.
function decimalFraction(value){
 const [mantissa,exponent='0']=String(value).split('e');
 const [whole,fraction='']=mantissa.split('.');
 const shift=Number(exponent)-fraction.length;
 const digits=BigInt(whole+fraction);
 return shift>=0?[digits*10n**BigInt(shift),1n]:[digits,10n**BigInt(-shift)];
}
const ceilFraction=(numerator,denominator)=>Number((numerator+denominator-1n)/denominator);
const asCents=value=>{const [n,d]=decimalFraction(value);return ceilFraction(n*100n,d);};

function pronunciationUnits(text,pronunciation){
 if(typeof text!=='string'||!text.trim()||text.length>24000)invalid('缺少这段实际要念或要读的原文');
 const expanded=pronunciation ?? text;
 if(typeof expanded!=='string'||expanded.length>24000||/\p{N}/u.test(expanded))invalid('数字或缩写缺少实际读法');
 const han=expanded.match(/\p{Script=Han}/gu)?.length??0;
 const phonetic=expanded.replace(/\p{Script=Han}/gu,' ').match(/[\p{L}\p{M}]+/gu)??[];
 if(pronunciation==null&&phonetic.length)invalid('外文缺少按发音拆开的读法');
 const count=han+phonetic.length;
 if(!count)invalid('没有可计算的发音或阅读单位');
 return count;
}

function speechCents(speech){
 if(!Array.isArray(speech)||speech.length>256)invalid('发声拆解格式无效');
 return speech.reduce((total,line)=>{
  if(!isRecord(line))invalid('一条发声缺少语义拆解');
  const pace=typeof line.pace==='string'&&Object.hasOwn(paceRates,line.pace)?paceRates[line.pace]:null;
  if(!pace)invalid('一条发声缺少有效语速档位');
  const [minimum,maximum,standard]=pace,rate=secondsValue(line.rate??standard,'语速');
  if(rate<minimum||rate>maximum)invalid('一条发声速度超出所选档位');
  const units=pronunciationUnits(line.text,line.pronunciation),[n,d]=decimalFraction(rate);
  return total+ceilFraction(BigInt(units)*100n*d,n);
 },0);
}

function pauseCents(group){
 if(group.pauses==null)return asCents(secondsValue(group.pause_seconds??0,'气口'));
 if(!Array.isArray(group.pauses)||group.pauses.length>256)invalid('气口拆解格式无效');
 return group.pauses.reduce((sum,pause)=>sum+(typeof pause==='string'&&Object.hasOwn(pauseAnchors,pause)
  ?pauseAnchors[pause]:asCents(secondsValue(pause,'气口'))),0);
}

export function durationFromSemanticClip(clip,limit){
 if(!isRecord(clip)||!Array.isArray(clip.groups)||!clip.groups.length||clip.groups.length>256)invalid('缺少有效的声画时间组');
 const kind=clip.kind??'regular';
 if(!['regular','transition'].includes(kind))invalid('片段类型无法识别');
 const tail=secondsValue(clip.tail_buffer_seconds??0.8,'尾缓冲');
 if(tail<0.5||tail>1)invalid('尾缓冲应为 0.5 至 1 秒');
 let speech=0,action=0,pauses=0,hasVisual=false;
 for(const group of clip.groups){
  if(!isRecord(group))invalid('声画时间组格式无效');
  const parallel=group.parallel_speech??[];
  if(!Array.isArray(parallel)||parallel.length>16)invalid('同步发声的轨道格式无效');
  const s=Math.max(speechCents(group.speech??[]),...parallel.map(speechCents));
  const p=pauseCents(group);
  let v=asCents(secondsValue(group.visual_seconds??0,'动作时长'));
  if(group.reading!=null){
   if(!isRecord(group.reading))invalid('默读缺少可见原文');
   const units=pronunciationUnits(group.reading.text,group.reading.pronunciation);
   const reading=Math.max(250,ceilFraction(BigInt(units*100),6n)+50);
   v=Math.max(v,reading+asCents(secondsValue(group.reading.extra_seconds??0,'默读停留')));
  }
  speech+=s;
  action+=Math.max(0,v-s-p);
  pauses+=p;
  hasVisual ||= v>0;
 }
 if(!speech&&!hasVisual)invalid('没有有效的发声或画面动作');
 if(kind==='transition'&&(speech||clip.groups.length>1))invalid('过场包含发声或多步表演，应按常规片段评估');
 pauses+=asCents(tail);
 const supplement=Math.max(0,(kind==='transition'?200:400)-speech-action-pauses);
 pauses+=supplement;
 const naturalSeconds=Math.ceil((speech+action+pauses)/100),capacity=durationCapacity(naturalSeconds,limit);
 const explanation=typeof clip.reason==='string'?clip.reason.replaceAll(RESEGMENT_DURATION_REASON,'').replace(/\s+/g,' ').trim().replace(/[。；;\s]+$/,'').slice(0,300):'';
 const reason=[explanation||'按实际发声、动作先后与气口估算',supplement?`补足 ${supplement/100} 秒表演底线`:'',capacity.needsResegment?RESEGMENT_DURATION_REASON:''].filter(Boolean).join('；')+'。';
 const estimate=validatedDurationEstimate({version:VIDEO_DURATION_ESTIMATOR_VERSION,status:'estimated',maxDurationSeconds:limit,naturalSeconds,...capacity,
  breakdown:{speechSeconds:speech/100,nonparallelActionSeconds:action/100,pauseBufferSeconds:pauses/100},reason});
 if(!estimate)invalid('声画时长超出可计算范围');
 return estimate;
}
