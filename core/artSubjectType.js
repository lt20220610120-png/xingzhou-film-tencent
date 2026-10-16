// Judge the depicted subject, not animals mentioned beside a human actor.
export function isCreatureAsset(asset){
 if(asset?.category!=='character')return false;
 if(/雕像|雕塑|玩偶|模型|标本|木雕|石雕/.test(String(asset.name||'')))return false;
 const raw=String(asset.description||''),content=raw.includes('【资产描述】')?raw.split('【资产描述】').at(-1):raw;
 if(/主体类型\s*[：:]\s*(?:生物|动物|非人形)|当前形态\s*[：:]\s*(?:兽形|动物形态)|纯生物形态/.test(content))return true;
 const positive=content.replace(/(?:不具备|不具有|没有|无|非)人形/g,'');
 if(/主体类型\s*[：:]\s*(?:人类|人形)|具有人形|人形四肢|人类(?:男性|女性|男子|女子)?|成年男子|成年女子|男性|女性|男孩|女孩|男人|女人|人形身体/.test(positive))return false;
 if(/非人(?:形|巨型)|四足|犬类身体|动物形态|物种\s*[：:]\s*(?:犬|猫|龙|狼|鸟|蛇|兽)/.test(content))return true;
 const name=String(asset.name||'').replace(/[【】]/g,'');
 return /流浪狗|宠物狗|猎犬|金毛犬|牧羊犬|小狗|黑狗|黄狗|白狗|猫咪|野猫|宠物猫|三首龙|巨龙|魔兽|异兽|灵兽|猛兽|野狼|老虎|狮子|雄鹰|蟒蛇|巨蛇|独角兽|(?:^|[-·])(?:狗|犬|猫|狼|狐|狐狸|虎|狮|龙|鸟|鹰|蛇|马|兔|鼠)(?:$|[-·])/.test(name)
  ||/(?:一只|一条|一匹|一头|主体[：:])\s*(?:[黑白黄棕灰红蓝绿大小幼老]*)(?:狗|犬|猫|狼|狐狸|虎|狮|龙|鸟|鹰|蛇|马|兔)/.test(content);
}
export function creaturePromptPrefix(style){
 const visual=style==='3D动漫'?'高质量3D CG生物角色，可信解剖结构与精细PBR毛发、鳞片或皮肤材质。':style==='2D动漫'?'统一2D手绘动画生物设定，结构清晰、线条稳定。':'写实生物摄影，真实物种解剖与毛发、鳞片或皮肤材质。';
 return visual+'纯白背景，仅展示同一只生物的完整三视图：正面全身、严格侧面全身、背面全身，三列等宽排版。物种、体型、毛色、花纹和身体结构完全一致，保留物种本身具有的完整头部、足肢、尾部、翅膀或鳍，不添加原物种没有的肢体。不要出现任何人物，不要人类陪同，不要拟人化，不要场景、环境、地景或额外道具，不使用人像拼贴。';
}
