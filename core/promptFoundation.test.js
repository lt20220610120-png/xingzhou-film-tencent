import test from 'node:test';
import assert from 'node:assert/strict';
import {readPromptFoundation} from './promptFoundation.js';
test('基础设定按分号保留对象描述，逗号衣着属性不拆成实体',()=>{
 const prompt='1-1-1\n【基础设定】\n人物：李大川（参考@），32岁，肤色偏深、短黑发凌乱，牛仔裤和旧胶鞋；法斗（参考@），宠物箱内；保镖甲（参考@）、保镖乙（参考@），各撑黑伞。\n场景：夜，外景为暴雨中的积水道路，内景为破旧面包车驾驶室（参考@）；驾驶台布满划痕。\n道具：粉钻戒指，已被吞下；二手逆变器，车座下；宠物箱，副驾驶。\n音色：成年男声\n限制：无字幕\n【画面内容】\n人物：不应读取镜头里的字段';
 const data=readPromptFoundation(prompt);
 assert.deepEqual(data.character.flatMap(row=>row.names),['李大川','法斗','保镖甲','保镖乙']);
 assert.deepEqual(data.prop.flatMap(row=>row.names),['粉钻戒指','二手逆变器','宠物箱']);
 assert.deepEqual(data.scene.flatMap(row=>row.names),['暴雨中的积水道路','破旧面包车驾驶室']);
 assert.match(data.character[0].text,/肤色偏深/);
});
test('无基础设定不会从镜头、音色或限制中生成实体',()=>{
 assert.deepEqual(readPromptFoundation('人物：张三\n【画面内容】\n道具：杯子'),{character:[],scene:[],prop:[]});
});
