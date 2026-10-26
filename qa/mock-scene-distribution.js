export async function mockSceneDistribution({messages}){
 window.qaBinding.ai++;
 const data=JSON.parse(messages[1].content),query=new URLSearchParams(location.search);
 if(query.has('slow'))await new Promise(resolve=>{window.qaBinding.release=resolve;});
 if(query.has('fail')||window.qaBinding.ai===1)return JSON.stringify({assignments:[],missing:[]});
 const p2=data.label==='1-1-2';
 return JSON.stringify({assignments:data.cards.map(card=>{
  const evidence=card.name.includes('张三-白衣')?'张三':card.name.includes('李四')?(p2?'李四':''):card.category==='scene'?(query.has('miss-scene')?'':data.prompt.includes('破旧面包车驾驶室')?'破旧面包车驾驶室':'客厅'):card.name.includes('杯子')?(p2?'张三-杯子':''):'';
  return {cardUid:card.uid,visibility:evidence?'visible':'excluded',evidence,reason:evidence?'本条镜头使用该资产':'本条没有使用该资产'};
 }),missing:data.prompt.includes('道具：手电筒')?[{category:'prop',text:'手电筒',reason:'本场清单尚未准备'}]:[]});
}
