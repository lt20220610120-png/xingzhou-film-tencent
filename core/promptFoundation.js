export const PROMPT_DISTRIBUTION_SKILL=`【内置分发 Skill】
1. 层级固定为集→场景→提示词。场景已有清单是唯一资产身份来源。
2. 先定位【基础设定】或【基础信息】，只从人物、场景、道具字段建立对象索引。中文分号“；”通常划分不同实体；同一片段里的逗号、顿号通常连接年龄、外貌、衣着、动作等描述，不能据此拆卡。多个明确姓名并列（如保镖甲、保镖乙）才是多个人物。
3. 例如“李大川（参考@），32岁，肤色偏深、短黑发凌乱，牛仔裤和旧胶鞋”只有李大川一个人物。肤色、发型、年龄、服装、鞋子、动作都属于属性。场景里的日夜、光影、材质也不是独立场景。
4. 用基础设定的完整描述匹配本场清单，包括别名、内外景、所有者和具体造型。再读后续镜头确认用途：后半段才出现也要关联；仅声音、仅提及、实际入镜要区分。禁止根据属性或镜头描述新建身份。
5. 若基础设定实体确实找不到本场卡片，返回缺项提醒，保留原选择，不能伪造卡片。不能仅因场景名称不同而忽略同义场景。`;

const empty=()=>({character:[],scene:[],prop:[]});
const name=text=>text.replace(/[（(][^）)]*[）)]/g,'').replace(/[【】\[\]]/g,'').replace(/[。\s]+$/g,'').trim();
const attribute=/^(?:肤色|发色|发型|短黑发|长黑发|短发|身材|年龄|穿|牛仔裤|旧胶鞋|驾驶台|副驾驶|车座|脚垫|前挡风|本段|同一时段|无其他|没有其他)/;
const sceneAttribute=/^(?:墙面|墙壁|地面|天花板|顶部|走廊顶部|走廊尽头|两人所在|灯光|光线|环境|背景|室内陈设|门窗|房门|窗外|摆放|悬挂|整体色调)/;
const sceneContinuation=text=>sceneAttribute.test(text)||/(?:门框|墙面|墙壁|地板|沙发|茶几|书架|窗帘|地毯|防盗门|向.*延伸|通向|通往|摆放|悬挂|斑驳|铺着|亮着|可开合)/.test(text);
export function readPromptFoundation(prompt=''){
 const source=readPromptFoundationBlock(prompt),out=empty();if(!source)return out;
 const block=source.text;
 const fields=[...block.matchAll(/(?:^|\n)\s*(人物|场景|道具|音色|声音|限制)\s*[：:]/g)],types={人物:'character',场景:'scene',道具:'prop'};
 for(let i=0;i<fields.length;i++){
  const field=fields[i],category=types[field[1]];if(!category)continue;
  const value=block.slice(field.index+field[0].length,fields[i+1]?.index??block.length).trim();
  let sceneFound=false;
  for(const text of value.split(/[；;]/).map(s=>s.trim()).filter(Boolean)){
   if(/^(?:无|没有|暂无)(?:关键|其他|任何|手持|道具|人物|角色|场景|参考)|^(?:不需要|无需)(?:参考|道具|人物|场景)/.test(text)||category==='scene'&&sceneAttribute.test(text))continue;
   // After a location declaration, unmarked clauses describe that location.
   // Another reference placeholder or explicit time/interior heading declares
   // a second location. Doors, furniture and wall detail are never new rooms.
   if(category==='scene'&&sceneFound&&sceneContinuation(text)&&!/(?:参考|内景为|外景为)|^(?:日|夜|白天|夜晚|日间|夜间|内|外)[，,]/.test(text))continue;
   let names=[];
   if(category==='scene'){
    names=[...text.matchAll(/(?:内景|外景)为([^，,；;\n]+)/g)].map(m=>name(m[1]));
    if(!names.length){const chunks=text.replace(/[（(][^）)]*[）)]/g,'').split(/[，,]/).map(name);names=chunks.filter(s=>! /^(?:日|夜|日间|夜间|白天|晚上|内|外|内景|外景)$/.test(s)).slice(0,1);}
   }else {
    // Parentheses can contain commas (e.g. 手机（林秋雨持有，屏幕亮）).
    // Remove complete parenthetical notes before splitting entity names.
    const head=text.replace(/[（(][^）)]*[）)]/g,'').split(/[，,]/)[0];
    names=head.split(category==='prop'?/[、与及]/:'、').map(name);
    if(category==='prop')names=names.map(s=>s.replace(/^.{1,12}的(?=.{1,12}$)/,'').replace(/^(?:[一二三四五六七八九十两\d]+[只个把件台瓶杯本])/,'').replace(/(?:各[一二三四五六七八九十两\d]+|[一二三四五六七八九十两\d]+[只个把件台瓶杯本具])$/,''));
   }
   names=names.filter(s=>s&&!attribute.test(s)&&! /^(?:无|没有|暂无|不需要)$/.test(s));
   if(names.length){out[category].push({text,names});if(category==='scene')sceneFound=true;}
  }
 }
 return out;
}

// Returns the exact UTF-16 range used for identity/evidence matching. Keeping
// this separate preserves the long-standing readPromptFoundation() shape.
export function readPromptFoundationBlock(prompt=''){
 const marker=/[【\[]基础(?:设定|信息)[】\]]/.exec(String(prompt));if(!marker)return null;
 const start=marker.index+marker[0].length,tail=String(prompt).slice(start),endOffset=/\n\s*[【\[][^\n]+?[】\]]/.exec(tail)?.index??tail.length;
 return {text:tail.slice(0,endOffset),start,end:start+endOffset};
}
