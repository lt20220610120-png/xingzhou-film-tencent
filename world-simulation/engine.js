// Xingzhou narrative kernel. Original implementation; external design references
// and inspected commits are recorded in RESEARCH.md. No model owns canonical state.
export const copy=value=>JSON.parse(JSON.stringify(value));
export const uid=()=>globalThis.crypto.randomUUID();
const deny=(message,code='WORLD_INVALID')=>{throw Object.assign(new Error(message),{code});};
const safeKey=k=>typeof k==='string'&&/^[\w\u3400-\u9fff:-]{1,128}$/.test(k)&&!['__proto__','prototype','constructor'].includes(k);
const text=(v,label,max=20000)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():deny(`${label}不能为空或过长`);
const arr=(v,label,max=20000)=>Array.isArray(v)&&v.length<=max?v:deny(`${label}需要有界数组`);
const id=(v,label)=>safeKey(v)?v:deny(`${label}编号无效`);
const finite=(v,label)=>typeof v==='number'&&Number.isFinite(v)?v:deny(`${label}需要有限数字`);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function safeData(v){if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))deny('不允许原型或构造器字段');safeData(x);}}
function dictionary(items,label){const result={};for(const v of arr(items,label)){id(v.id,label);if(Object.hasOwn(result,v.id))deny(`${label}编号重复`);result[v.id]=copy(v);}return result;}
export function validateSeed(raw){
 safeData(raw);const seed=copy(raw);seed.characters=arr(seed.characters||[],'人物',1000).map(c=>({...c,id:id(c.id,'人物'),name:text(c.name,'人物姓名',200),goal:typeof c.goal==='string'?c.goal:'',alive:c.alive!==false,locationId:c.locationId||null,resources:c.resources||{},relations:c.relations||{},knowledge:c.knowledge||[]}));
 seed.locations=arr(seed.locations||[],'地点',1000);seed.rules=arr(seed.rules||[],'规则',1000);seed.facts=arr(seed.facts||[],'事实',10000);seed.routes=arr(seed.routes||[],'旅行路线',10000);
 const chars=dictionary(seed.characters,'人物'),places=dictionary(seed.locations,'地点'),facts=dictionary(seed.facts,'事实');dictionary(seed.rules,'规则');
 for(const c of seed.characters){if(c.locationId&&!places[c.locationId])deny('人物所在地点不存在');for(const [k,n] of Object.entries(c.resources)){if(!safeKey(k)||finite(n,'资源')<0)deny('资源不能为负');}for(const k of Object.keys(c.relations))if(!chars[k])deny('关系引用了未知人物');for(const k of c.knowledge)if(!facts[k])deny('人物知情引用了未知事实');}
 for(const f of seed.facts){text(f.text,'事实');for(const k of f.knownBy||[])if(!chars[k])deny('事实知情人物不存在');}
 for(const r of seed.routes){if(!places[r.from]||!places[r.to]||finite(r.minutes,'旅行时间')<0)deny('旅行约束无效');}
 return seed;
}
export function createWorld(seed,{id:worldId=uid(),name='大世界模拟项目',source=null}={}){
 return {version:1,id:id(worldId,'世界'),name:text(name,'世界名',200),seed:validateSeed(seed),source:copy(source),activeBranchId:'main',branches:[{id:'main',name:'原路线',parentId:null,events:[],scheduled:[],pending:[],revision:0,checkpoints:[]}],candidates:[],runs:[],documents:[]};
}
export function getBranch(world,branchId=world.activeBranchId){return world.branches.find(b=>b.id===branchId)||deny('分支已不存在');}
export function worldFingerprint(world,branchId=world.activeBranchId){const b=getBranch(world,branchId);return JSON.stringify([world.id,world.seed,b.id,b.revision,b.events,b.scheduled]);}
function initialState(seed){const s={time:0,characters:dictionary(seed.characters,'人物'),locations:dictionary(seed.locations,'地点'),facts:dictionary(seed.facts,'事实'),memories:[],eventIds:[]};for(const c of Object.values(s.characters))c.knowledge=[...new Set([...(c.knowledge||[]),...seed.facts.filter(f=>f.public||f.knownBy?.includes(c.id)).map(f=>f.id)])];return s;}
function field(obj,path){if(path==='alive'||path==='locationId'||path==='goal')return obj[path];const parts=path.split('.');if(parts.length===2&&['resources','relations'].includes(parts[0])&&safeKey(parts[1]))return obj[parts[0]]?.[parts[1]];deny('状态字段不在允许范围');}
function change(obj,patch){const old=field(obj,patch.field);if(!['set','add'].includes(patch.op))deny('状态变更操作不合法');const value=patch.op==='add'?finite(old??0,'旧资源')+finite(patch.value,'变更值'):patch.value;
 if(patch.field==='alive'&&typeof value!=='boolean'||patch.field==='goal'&&typeof value!=='string'||patch.field==='locationId'&&value!==null&&typeof value!=='string')deny('状态字段类型错误');
 if(patch.field.startsWith('resources.')&&(finite(value,'资源结果')<0))deny('资源消耗超过现有数量');
 if(patch.field.startsWith('relations.')&&!(typeof value==='string'||typeof value==='number'&&Number.isFinite(value)))deny('关系值无效');
 const [a,b]=patch.field.split('.');if(b)obj[a][b]=value;else obj[a]=value;
}
export function applyEvent(state,raw,seed){
 safeData(raw);const e=copy(raw);id(e.id,'事件');text(e.title,'事件标题',300);text(e.summary,'事件内容');finite(e.time,'事件时间');if(e.time<state.time||e.time<0)deny('事件时间早于当前世界');if(state.eventIds.includes(e.id))deny('事件编号重复');
 e.actorIds=arr(e.actorIds||[],'参与人物',1000);e.dependsOn=arr(e.dependsOn||[],'因果前提');e.effects=arr(e.effects||[],'状态变更',1000);e.reads=arr(e.reads||[],'读依赖',1000);e.observations=arr(e.observations||[],'人物观察',1000);
 for(const actorId of e.actorIds){const c=state.characters[actorId];if(!c)deny('事件包含未知人物');if(!c.alive)deny('人物不再存活，不能继续行动');}
 for(const earlier of e.dependsOn)if(!state.eventIds.includes(earlier))deny('因果前提尚未发生');
 for(const r of e.reads){const c=state.characters[r.entityId];if(!c||!equal(field(c,r.field),r.value))deny('状态前提不成立');}
 for(const k of e.requiresKnowledge||[])if(!state.characters[k.actorId]?.knowledge.includes(k.factId))deny('人物没有取得所需知情信息');
 const next=copy(state);for(const p of e.effects){const c=next.characters[p.entityId];if(!c)deny('状态变更引用了未知人物');if(p.field==='locationId'&&p.value!==null){if(!next.locations[p.value])deny('目标地点不存在');if(c.locationId&&c.locationId!==p.value){const r=seed.routes.find(r=>r.from===c.locationId&&r.to===p.value);if(!r)deny('没有已确认的旅行路线');if(finite(e.duration??0,'旅行时长')<r.minutes||e.time-state.time<r.minutes)deny('旅行所需时间不足');}}
  if(p.field.startsWith('relations.')&&!next.characters[p.field.split('.')[1]])deny('关系引用了未知人物');change(c,p);
 }
 for(const f of e.newFacts||[]){id(f.id,'新事实');if(next.facts[f.id])deny('新事实编号重复');text(f.text,'新事实');for(const actorId of f.knownBy||[])if(!next.characters[actorId])deny('知情人物不存在');next.facts[f.id]=copy(f);if(f.public)for(const c of Object.values(next.characters))c.knowledge.push(f.id);else for(const k of f.knownBy||[])next.characters[k].knowledge.push(f.id);}
 for(const l of e.learns||[]){if(!next.characters[l.actorId]||!next.facts[l.factId])deny('取得信息的引用不存在');if(!e.actorIds.includes(l.actorId))deny('知情变更必须列出本次参与人物');next.characters[l.actorId].knowledge=[...new Set([...next.characters[l.actorId].knowledge,l.factId])];}
 for(const o of e.observations){if(!next.characters[o.actorId]||!e.actorIds.includes(o.actorId))deny('观察者不在本次参与人物中');text(o.text,'人物观察');next.memories.push({actorId:o.actorId,eventId:e.id,time:e.time,text:o.text});}
 next.time=e.time;next.eventIds.push(e.id);return next;
}
export function branchState(world,branchId=world.activeBranchId){let s=initialState(validateSeed(world.seed));for(const e of getBranch(world,branchId).events)s=applyEvent(s,e,world.seed);return s;}
export function addCandidate(world,branchId,raw){
 const branch=getBranch(world,branchId);if(world.candidates.some(c=>c.id===raw.id))deny('候选编号重复');let s=branchState(world,branchId);const events=arr(raw.events,'候选事件',100);if(!events.length)deny('候选事件不能为空');
 const incoming=[...branch.scheduled.filter(e=>e.time<=Math.max(...events.map(e=>e.time))),...events].sort((a,b)=>a.time-b.time);
 for(const e of incoming)s=applyEvent(s,e,world.seed);
 const candidate={id:id(raw.id||uid(),'候选'),name:text(raw.name,'候选名',200),reasoning:typeof raw.reasoning==='string'?raw.reasoning:'',conditions:typeof raw.conditions==='string'?raw.conditions:'',events:copy(events),branchId,fingerprint:worldFingerprint(world,branchId),status:'pending'};
 return {...copy(world),candidates:[...copy(world.candidates),candidate]};
}
export function commitCandidate(world,branchId,candidateId){
 const c=world.candidates.find(c=>c.id===candidateId&&c.branchId===branchId)||deny('找不到当前分支候选');if(c.status==='adopted')return world;if(c.status!=='pending'||c.fingerprint!==worldFingerprint(world,branchId))deny('候选依据已过期，请重新推演','WORLD_STALE');
 let next=copy(world),b=getBranch(next,branchId),s=branchState(next,branchId);const horizon=Math.max(...c.events.map(e=>e.time)),due=b.scheduled.filter(e=>e.time<=horizon),events=[...due,...c.events].sort((a,b)=>a.time-b.time);
 for(const e of events){s=applyEvent(s,e,next.seed);b.events.push(copy(e));}
 b.scheduled=b.scheduled.filter(e=>e.time>horizon);b.pending=b.pending.filter(e=>e.time>horizon);b.revision++;b.checkpoints.push({eventCount:b.events.length,revision:b.revision,state:copy(s)});if(b.checkpoints.length>20)b.checkpoints.shift();next.candidates.find(v=>v.id===candidateId).status='adopted';return next;
}
function touched(e){return [...(e.effects||[]).map(p=>`${p.entityId}:${p.field}`),...(e.learns||[]).map(p=>`${p.actorId}:knowledge`),...(e.newFacts||[]).map(f=>`fact:${f.id}`)];}
export function forkBranch(world,branchId,{id:branchIdNew=uid(),name='自动演进分支'}={}){if(world.branches.some(b=>b.id===branchIdNew))deny('分支编号重复');const b=copy(getBranch(world,branchId)),next=copy(world);b.id=id(branchIdNew,'分支');b.name=text(name,'分支名',200);b.parentId=branchId;b.checkpoints=[];next.branches.push(b);next.activeBranchId=b.id;return next;}
export function forkAt(world,branchId,eventId,replacement,{id:branchIdNew=uid(),name='干预分支'}={}){
 const base=getBranch(world,branchId),index=base.events.findIndex(e=>e.id===eventId);if(index<0)deny('干预事件不存在');const old=base.events[index];if(old.locked)deny('事件已锁定，不能静默改写');if(replacement.id!==eventId||replacement.time!==old.time)deny('干预保留事件编号和时间，其他时点请注入新事件');
 let next=forkBranch(world,branchId,{id:branchIdNew,name}),b=getBranch(next),changed=new Set([eventId]),writes=new Set([...touched(old),...touched(replacement)]),actors=new Set([...old.actorIds||[],...replacement.actorIds||[],...(old.effects||[]).map(e=>e.entityId),...(replacement.effects||[]).map(e=>e.entityId)]);
 b.events=copy(base.events.slice(0,index));b.events.push(copy(replacement));branchState(next,b.id);b.pending=[];b.scheduled=[];
 for(const e of [...base.events.slice(index+1),...base.scheduled].sort((a,b)=>a.time-b.time)){
  const direct=(e.dependsOn||[]).some(k=>changed.has(k)),reads=(e.reads||[]).some(r=>writes.has(`${r.entityId}:${r.field}`))||(e.requiresKnowledge||[]).some(r=>writes.has(`fact:${r.factId}`)||writes.has(`${r.actorId}:knowledge`)),actor=(e.actorIds||[]).some(k=>actors.has(k));
  if(direct||reads||actor){if(e.locked)deny('干预影响了锁定的后续事件，请先处理约束冲突');changed.add(e.id);for(const k of touched(e))writes.add(k);for(const k of e.actorIds||[])actors.add(k);b.pending.push({...copy(e),invalidatedBy:eventId,reason:direct?'因果前提改变':reads?'读取的状态改变':'相关人物经历改变，保守重推'});}else b.scheduled.push(copy(e));
 }
 for(const e of base.pending||[])if(!b.pending.some(p=>p.id===e.id))b.pending.push(copy(e));b.revision++;b.checkpoints=[{eventCount:b.events.length,revision:b.revision,state:branchState(next,b.id)}];return next;
}
export function compareBranches(world,a,b){const aa=getBranch(world,a),bb=getBranch(world,b),all=x=>[...x.events,...x.scheduled,...x.pending];const old=new Map(all(aa).map(e=>[e.id,e])),now=new Map(all(bb).map(e=>[e.id,e]));return {changed:[...old.keys()].filter(k=>now.has(k)&&!equal(old.get(k),now.get(k))),removed:[...old.keys()].filter(k=>!now.has(k)),added:[...now.keys()].filter(k=>!old.has(k)),pending:bb.pending.map(e=>({id:e.id,title:e.title,reason:e.reason})),states:{before:branchState(world,a),after:branchState(world,b)}};}
export function observeActor(world,branchId,actorId){const s=branchState(world,branchId),c=s.characters[actorId]||deny('人物不存在');return {time:s.time,actor:copy(c),places:world.seed.locations.filter(p=>p.id===c.locationId),rules:world.seed.rules.filter(r=>r.public!==false),facts:c.knowledge.map(k=>s.facts[k]).filter(Boolean).map(f=>({id:f.id,text:f.text})),memories:s.memories.filter(m=>m.actorId===actorId).slice(-30),nearby:Object.values(s.characters).filter(v=>v.id!==actorId&&v.locationId===c.locationId).map(v=>({id:v.id,name:v.name,locationId:v.locationId}))};}
export function exportLife(world,branchId,actorId){const s=branchState(world,branchId),c=s.characters[actorId]||deny('请选择主角');return `${world.name} · ${getBranch(world,branchId).name}\n主角：${c.name}\n\n`+getBranch(world,branchId).events.filter(e=>e.actorIds?.includes(actorId)||e.effects?.some(p=>p.entityId===actorId)).map(e=>`【${e.time}】${e.title}\n${e.summary}`).join('\n\n');}
