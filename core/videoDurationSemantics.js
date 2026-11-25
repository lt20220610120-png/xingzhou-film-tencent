import {durationCapacity,RESEGMENT_DURATION_REASON,validatedDurationEstimate,VIDEO_DURATION_ESTIMATOR_VERSION} from './videoDurationMetadata.js';

const paceRates={slow:[3.8,4.8,4.5],normal:[5.4,6.4,6],fast:[6.5,7.5,7],very_fast:[7.2,8,7.5]};
const commonAcronyms=new Set(['ok','vip','ceo','app','ai','api','id','ip','vo','os','ui','hr','pdf','ppt','usb','url','npc','cfo','cto','cpu','gpu']);
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

function spokenDigits(digits){
 if(digits.startsWith('0'))return digits.length;
 if(digits.length===2){
  const [tens,ones]=digits;
  return 1+(tens!=='1'?1:0)+(ones!=='0'?1:0);
 }
 if(digits.length===3){
  const [,tens,ones]=digits;
  if(tens==='0')return ones==='0'?2:4;
  return ones==='0'?4:5;
 }
 if(/^\d000$/.test(digits))return 2;
 return digits.length;
}

function pronunciationUnits(text,pronunciation){
 if(typeof text!=='string'||!text.trim()||text.length>24000)invalid('缺少这段实际要念或要读的原文');
 const original=text.normalize('NFKC');
 if(!/[\p{L}\p{N}]/u.test(original))invalid('没有可计算的发音或阅读单位');
 const source=pronunciation??text;
 if(typeof source!=='string'||source.length>24000)invalid('缺少这段实际要念或要读的原文');
 let expanded=pronunciation==null?original:source.normalize('NFKC'),numbers=0;
 if(pronunciation==null)expanded=expanded.replace(/\d+(?:\.\d+)?/g,number=>{
  const [whole,fraction]=number.split('.');
  numbers+=spokenDigits(whole)+(fraction?fraction.length+1:0);
  return ' ';
 });
 if(/\p{N}/u.test(expanded))invalid('数字或缩写缺少实际读法');
 const han=expanded.match(/\p{Script=Han}/gu)?.length??0;
 const words=expanded.replace(/\p{Script=Han}/gu,' ').match(/\p{L}[\p{L}\p{M}]*/gu)??[];
 let phonetic=0;
 for(const word of words){
  if(pronunciation!=null)phonetic++;
  else if(/^[A-Z]{1,4}$/.test(word)||commonAcronyms.has(word.toLowerCase()))phonetic+=word.length;
  else invalid('外文缺少按发音拆开的读法');
 }
 const count=numbers+han+phonetic;
 if(!count)invalid('没有可计算的发音或阅读单位');
 return count;
}

function turnLedger(turns){
 if(!Array.isArray(turns)||turns.length>256)invalid('发声拆解格式无效');
 let speech=0,pause=0;
 for(const line of turns){
  if(!isRecord(line))invalid('一条发声缺少语义拆解');
  const name=line.pace??'normal';
  const pace=typeof name==='string'&&Object.hasOwn(paceRates,name)?paceRates[name]:null;
  if(!pace)invalid('一条发声缺少有效语速档位');
  const [minimum,maximum,standard]=pace,rate=secondsValue(line.rate??standard,'语速');
  if(rate<minimum||rate>maximum)invalid('一条发声速度超出所选档位');
  const units=pronunciationUnits(line.text,line.pronunciation),[n,d]=decimalFraction(rate);
  const voiced=ceilFraction(BigInt(units)*100n*d,n),tight=line.tight===true;
  speech+=voiced;
  pause+=Math.max((tight?150:200)-voiced,tight?40:70);
 }
 return {speech,pause};
}

function groupSpeech(group){
 const parallel=group.parallel_speech??[];
 if(!Array.isArray(parallel)||parallel.length>16)invalid('同步发声的轨道格式无效');
 let longest=turnLedger(group.turns??group.speech??[]);
 for(const turns of parallel){
  const track=turnLedger(turns);
  if(track.speech+track.pause>longest.speech+longest.pause)longest=track;
 }
 return longest;
}

export function durationFromSemanticClip(clip,limit){
 if(!isRecord(clip)||!Array.isArray(clip.groups)||!clip.groups.length||clip.groups.length>256)invalid('缺少有效的声画时间组');
 const kind=clip.kind??'regular';
 if(!['regular','transition'].includes(kind))invalid('片段类型无法识别');
 const tail=secondsValue(clip.tail_buffer_seconds??0.6,'尾缓冲');
 if(tail<0.5||tail>0.8)invalid('尾缓冲应为 0.5 至 0.8 秒');
 let speech=0,action=0,pauses=0,hasVisual=false;
 for(const group of clip.groups){
  if(!isRecord(group))invalid('声画时间组格式无效');
  const {speech:s,pause}=groupSpeech(group);
  const p=pause+asCents(secondsValue(group.pause_seconds??0,'独立停顿'));
  let v=asCents(secondsValue(group.visual_seconds??0,'动作时长'));
  if(group.reading!=null){
   if(!isRecord(group.reading))invalid('默读缺少可见原文');
   const units=pronunciationUnits(group.reading.text,group.reading.pronunciation);
   const reading=Math.max(200,ceilFraction(BigInt(units)*200n,15n)+50);
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
