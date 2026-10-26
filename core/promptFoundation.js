export const PROMPT_DISTRIBUTION_SKILL=`【内置分发 Skill】
1. 层级固定为集→场景→提示词。场景已有清单是唯一资产身份来源。
2. 先定位【基础设定】或【基础信息】，只从人物、场景、道具字段建立对象索引。中文分号“；”通常划分不同实体；同一片段里的逗号、顿号通常连接年龄、外貌、衣着、动作等描述，不能据此拆卡。多个明确姓名并列（如保镖甲、保镖乙）才是多个人物。
3. 例如“李大川（参考@），32岁，肤色偏深、短黑发凌乱，牛仔裤和旧胶鞋”只有李大川一个人物。肤色、发型、年龄、服装、鞋子、动作都属于属性。场景里的日夜、光影、材质也不是独立场景。
4. 用基础设定的完整描述匹配本场清单，包括别名、内外景、所有者和具体造型。再读后续镜头确认用途：后半段才出现也要关联；仅声音、仅提及、实际入镜要区分。禁止根据属性或镜头描述新建身份。
5. 若基础设定实体确实找不到本场卡片，返回缺项提醒，保留原选择，不能伪造卡片。不能仅因场景名称不同而忽略同义场景。`;

const empty=()=>({character:[],scene:[],prop:[]});
const name=text=>text.replace(/[（(][^）)]*[）)]/g,'').replace(/[【】\[\]]/g,'').replace(/[。\s]+$/g,'').trim();
const attribute=/^(?:肤色|发色|发型|短黑发|长黑发|短发|身材|年龄|穿|牛仔裤|旧胶鞋|驾驶台|副驾驶|车座|脚垫|前挡风|本段|同一时段|无其他|没有其他)/;
export function readPromptFoundation(prompt=''){
 const source=readPromptFoundationBlock(prompt),out=empty();if(!source)return out;
 const block=source.text;
 const fields=[...block.matchAll(/(?:^|\n)\s*(人物|场景|道具|音色|声音|限制)\s*[：:]/g)],types={人物:'character',场景:'scene',道具:'prop'};
 for(let i=0;i<fields.length;i++){
  const field=fields[i],category=types[field[1]];if(!category)continue;
  const value=block.slice(field.index+field[0].length,fields[i+1]?.index??block.length).trim();
  for(const text of value.split(/[；;]/).map(s=>s.trim()).filter(Boolean)){
   let names=[];
   if(category==='scene'){
    names=[...text.matchAll(/(?:内景|外景)为([^，,；;\n]+)/g)].map(m=>name(m[1]));
    if(!names.length){const chunks=text.split(/[，,]/).map(name);names=chunks.filter(s=>! /^(?:日|夜|日间|夜间|白天|晚上|内|外|内景|外景)$/.test(s)).slice(0,1);}
   }else names=text.split(/[，,]/)[0].split('、').map(name);
   names=names.filter(s=>s&&!attribute.test(s)&&! /^(?:无|没有|暂无|不需要)$/.test(s));
   if(names.length)out[category].push({text,names});
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
