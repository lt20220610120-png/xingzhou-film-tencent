import {fixture} from './promptDistribution.fixtures.js';
export const prompt=`1-1-1
【基础设定】
人物：时江晚（参考@），成年女性，老旧居民楼走廊内站立，穿日常家居外套；林秋雨（参考@），成年女性，与时江晚面对面站立；本段无新入场者。
场景：夜，内，老旧居民楼走廊（参考@）；墙面斑驳，走廊顶部悬挂声控灯，走廊尽头为楼梯口，两人所在处为走廊中段。
道具：无关键手持道具。
音色：时江晚，年轻女声，清亮偏柔；林秋雨，年轻女声，温和明快。
限制：禁止字幕、水印、Logo和无意义UI；无需背景音乐。
【连续台词】
D01｜时江晚｜现场对白｜分镜01开始：『你真的能听到我的心声？』
D02｜时江晚｜内心VO｜分镜02开始：『怎么可能？』
D03｜林秋雨｜现场对白｜分镜03开始：『你说，你心里的秘密要全被我知道了。』
D04｜时江晚｜现场对白｜分镜06开始：『你真的能听见？！』`;
export function example134(){
 const f=fixture(),ep=f.project.episodes[0],r=f.ledger.episodes[1];ep.prompts=[{id:'example',label:'1-1-1',content:prompt}];
 r.scenes[0].items=[['one','character','【时江晚-日常服】'],['two','character','【林秋雨-日常服】'],['hall','scene','【老旧居民楼·走廊-内】']].map(([id,category,name])=>({id,category,name,description:'已核对的美术描述',ready:true,manual:true}));r.roster=r.scenes[0].items;r.unassigned=[];
 ep.content='1-1 老旧居民楼走廊 夜 内\n时江晚：你真的能听到我的心声？\n林秋雨：你说，你心里的秘密要全被我知道了。';r.sourceContent=ep.content;r.scenes[0].source=ep.content;
 return f;
}
