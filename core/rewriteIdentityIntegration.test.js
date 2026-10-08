import test from 'node:test';
import assert from 'node:assert/strict';
import {identityProject,identityCandidate,confirmedIdentityProject} from './test-support/rewriteIdentity.test.js';
import {conversionCandidate} from './test-support/rewriteConversion.test.js';
import {runCreatorTask} from './creatorAi.js';
import {appendCreatorRecord,adoptCreatorRecord,creatorInputFingerprint,normalizeCreatorProject,updateCreatorSection} from './creatorWorkspace.js';
import {changeRewriteIdentity} from './rewriteIdentity.js';
import {applyIdentityConversion,assertCanonicalRewriteProse} from './rewriteConversion.js';
import {addRewritePlan,applyRewriteVersion} from './rewriteWorkflow.js';
import * as storyIdentity from './rewriteStory.js';
import {adoptOutlineVersion} from './rewriteWorldVersions.js';
import {readRewriteOutline} from './rewriteOutline.js';

test('identity and conversion run through actual task construction and adoption without automatic confirmation',async()=>{
 let p=normalizeCreatorProject(identityProject(),'script'),state={scriptProjects:[p],skills:[]};let request;
 const target={section:'characters',task:'rewriteIdentity',side:'output'};
 const output=await runCreatorTask({api:{aiChat:async r=>(request=r,JSON.stringify(identityCandidate()))},state,project:p,target,profile:{id:'mock',model:'mock',endpoint:'https://example.invalid'},instruction:'女主统一夏初雪，母亲用关系称谓。'});
 assert.match(request.messages.at(-1).content,/不按名字/);assert.match(request.messages.at(-1).content,/女主统一夏初雪/);
 state=appendCreatorRecord(state,'script',p.id,{id:'identity-r',target,status:'pending',output:output.output,inputFingerprint:creatorInputFingerprint(p,target)});
 state=adoptCreatorRecord(state,'script',p.id,'identity-r');p=state.scriptProjects[0];assert.equal(p.creator.rewrite.identity.accepted,false);
 p=changeRewriteIdentity(p,{type:'confirm'});state.scriptProjects[0]=p;
 const convert={section:'macroOutline',task:'rewriteConvert',onlyPending:true};
 const generated=await runCreatorTask({api:{aiChat:async r=>(request=r,JSON.stringify(conversionCandidate()))},state,project:p,target:convert,profile:{id:'mock',model:'mock',endpoint:'https://example.invalid'}});
 assert.match(request.messages.at(-1).content,/sourceActorRefs/);
 state=appendCreatorRecord(state,'script',p.id,{id:'conversion-r',target:convert,status:'pending',output:generated.output,inputFingerprint:creatorInputFingerprint(p,convert)});
 state=adoptCreatorRecord(state,'script',p.id,'conversion-r');assert.match(state.scriptProjects[0].creator.sections.macroOutline.output,/夏初雪/);
 state=updateCreatorSection(state,'script',p.id,'macroOutline',{accepted:true,stale:false});assert.equal(state.scriptProjects[0].creator.sections.characters.stale,false);
});
test('in-flight identity candidate cannot be adopted after source edits',()=>{
 const p=normalizeCreatorProject(identityProject(),'script'),target={section:'characters',task:'rewriteIdentity'};
 let s={scriptProjects:[p]};s=appendCreatorRecord(s,'script',p.id,{id:'r',target,status:'pending',output:JSON.stringify(identityCandidate()),inputFingerprint:creatorInputFingerprint(p,target)});
 s.scriptProjects[0].creator.source.content+='来源改动';assert.throws(()=>adoptCreatorRecord(s,'script',p.id,'r',{allowStale:true}),/变化/);
});
test('episode versions restore the cast and conversion evidence from that version',()=>{
 let p=applyIdentityConversion(confirmedIdentityProject(),{},conversionCandidate()),s={scriptProjects:[p]},id=p.id;
 const plan={majorEvents:[{id:'event',title:'相遇',startEpisode:1,endEpisode:1,events:'夏初雪赴宴'}],episodes:[{number:1,outline:'夏初雪接受女主母亲的邀请',eventIds:['event']}]};
 s=addRewritePlan(s,id,plan);const a=s.scriptProjects[0].creator.rewrite.versions[0].id;
 p=changeRewriteIdentity(s.scriptProjects[0],{type:'person.update',id:'hero',patch:{name:'夏宁'}});p=changeRewriteIdentity(p,{type:'confirm'});
 const changed=conversionCandidate();changed.groups[0].goal=changed.groups[0].goal.replace('夏初雪','夏宁');changed.groups[0].events[0].summary=changed.groups[0].events[0].summary.replace('夏初雪','夏宁');
 s.scriptProjects[0]=applyIdentityConversion(p,{},changed);const planB=JSON.parse(JSON.stringify(plan).replaceAll('夏初雪','夏宁'));
 s=addRewritePlan(s,id,planB);const b=s.scriptProjects[0].creator.rewrite.versions[1].id;
 s=applyRewriteVersion(s,id,b);assert.equal(s.scriptProjects[0].creator.rewrite.identity.people[0].name,'夏宁');
 s=applyRewriteVersion(s,id,a);assert.equal(s.scriptProjects[0].creator.rewrite.identity.people[0].name,'夏初雪');assert.match(s.scriptProjects[0].creator.sections.macroOutline.output,/夏初雪/);
});
test('canonical story validation rejects source names only in new prose, allowing explicitly adopted same names',()=>{
 const p=applyIdentityConversion(confirmedIdentityProject(),{},conversionCandidate());assert.throws(()=>assertCanonicalRewriteProse(p,'宋馨雅：谢谢你。'),/原名/);
 assert.doesNotThrow(()=>assertCanonicalRewriteProse(p,'夏初雪：谢谢你。'));
 p.creator.rewrite.identity.people[0].name='宋馨雅';assert.doesNotThrow(()=>assertCanonicalRewriteProse(p,'宋馨雅：谢谢你。'));
});
test('partial story refresh stamps only the rewritten entry and leaves other stale stories resumable',()=>{
 assert.equal(typeof storyIdentity.stampStoryIdentity,'function');assert.equal(typeof storyIdentity.storyIdentityCurrent,'function');
 let p=confirmedIdentityProject(),outline=JSON.parse(p.creator.sections.macroOutline.output);outline.groups[0].events.push({...outline.groups[0].events[0],id:'e2'});p.creator.sections.macroOutline.output=JSON.stringify(outline);
 const conversion=conversionCandidate();conversion.groups[0].events.push({...conversion.groups[0].events[0],eventId:'e2'});p=applyIdentityConversion(p,{},conversion);
 const data={format:'story-v1',eventGroups:[{id:'s1',groupId:'g',eventId:'e',title:'相遇',story:'夏初雪归还失物',episodes:[]},{id:'s2',groupId:'g',eventId:'e2',title:'后续',story:'夏初雪接受邀请',episodes:[]}]};
 const stamped=storyIdentity.stampStoryIdentity(p,data,['e','e2']);assert.ok(stamped.eventGroups.every(r=>storyIdentity.storyIdentityCurrent(p,r)));
 p=changeRewriteIdentity(p,{type:'person.update',id:'hero',patch:{name:'夏宁'}});p=changeRewriteIdentity(p,{type:'confirm'});
 conversion.groups[0].goal=conversion.groups[0].goal.replaceAll('夏初雪','夏宁');conversion.groups[0].events.forEach(e=>e.summary=e.summary.replaceAll('夏初雪','夏宁'));p=applyIdentityConversion(p,{},conversion);
 stamped.eventGroups[0].story='夏宁归还失物';const refreshed=storyIdentity.stampStoryIdentity(p,stamped,['e']);
 assert.equal(storyIdentity.storyIdentityCurrent(p,refreshed.eventGroups[0]),true);assert.equal(storyIdentity.storyIdentityCurrent(p,refreshed.eventGroups[1]),false);
 assert.throws(()=>assertCanonicalRewriteProse(p,refreshed.eventGroups[1].story),/旧名|姓名|名字/);
});

test('legacy outline version restoration never borrows a confirmed cast from the current version',()=>{
 const p=confirmedIdentityProject(),oldOutline=identityProject().creator.sections.macroOutline.output;
 p.creator.rewrite.outlineVersions=[{id:'legacy',number:1,output:oldOutline,target:{section:'macroOutline',task:'rewriteWorldSim',sourceIds:[]}}];
 const restored=adoptOutlineVersion({scriptProjects:[p]},p.id,'legacy',{allowStale:true}).scriptProjects[0];
 assert.equal(restored.creator.rewrite.identity,null);assert.equal(restored.creator.sections.characters.accepted,false);
 assert.equal(restored.creator.sections.macroOutline.accepted,false);assert.deepEqual(readRewriteOutline(restored.creator.sections.macroOutline.output),readRewriteOutline(oldOutline));
});
