function createProgressReporter(onProgress,{interval=125,now=Date.now}={}){
 let lastSent=-Infinity,lastPercent=0;
 return ({transferred=0,total=0},force=false)=>{
  const time=now();
  if(!force&&time-lastSent<interval)return;
  const computed=total?Math.min(100,Math.round(transferred/total*100)):0;
  const percent=force?100:Math.max(lastPercent,computed);
  lastSent=time;lastPercent=percent;
  onProgress?.({percent,transferred,total});
 };
}
module.exports={createProgressReporter};
