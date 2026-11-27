import rules from '../cloud-backend/shared/art-asset-rules.json' with {type:'json'};

const creaturePatterns = Object.fromEntries(['inanimateCreatureName','explicitCreature','explicitHumanForm','creatureDescription','creatureName','creatureSubject']
 .map(key=>[key,new RegExp(rules[key])]));
const negatedHumanForm = new RegExp(rules.negatedHumanForm,'g');

// Judge the depicted subject, not animals mentioned beside a human actor.
export function isCreatureAsset(asset){
 if(asset?.category!=='character')return false;
 if(creaturePatterns.inanimateCreatureName.test(String(asset.name||'')))return false;
 const raw=String(asset.description||''),content=raw.includes('【资产描述】')?raw.split('【资产描述】').at(-1):raw;
 if(creaturePatterns.explicitCreature.test(content))return true;
 if(creaturePatterns.explicitHumanForm.test(content.replace(negatedHumanForm,'')))return false;
 if(creaturePatterns.creatureDescription.test(content))return true;
 const name=String(asset.name||'').replace(/[【】]/g,'');
 return creaturePatterns.creatureName.test(name)||creaturePatterns.creatureSubject.test(content);
}
export function creaturePromptPrefix(style){
 const visual=style==='3D动漫'?'高质量3D CG生物角色，可信解剖结构与精细PBR毛发、鳞片或皮肤材质。':style==='2D动漫'?'统一2D手绘动画生物设定，结构清晰、线条稳定。':'写实生物摄影，真实物种解剖与毛发、鳞片或皮肤材质。';
 return visual+'纯白背景，仅展示同一只生物的完整三视图：正面全身、严格侧面全身、背面全身，三列等宽排版。物种、体型、毛色、花纹和身体结构完全一致，保留物种本身具有的完整头部、足肢、尾部、翅膀或鳍，不添加原物种没有的肢体。不要出现任何人物，不要人类陪同，不要拟人化，不要场景、环境、地景或额外道具，不使用人像拼贴。';
}
