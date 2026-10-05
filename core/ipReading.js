export const normalizeReadConcurrency=value=>Math.max(1,Math.min(8,Math.trunc(Number(value)||1)));

// Drain in-flight work before rejecting: successful records remain resumable,
// and a failed pool cannot keep sending requests after its task has ended.
export async function runReadingPool(jobs,read,{concurrency=1,isCancelled=()=>false}={}){
 let cursor=0,failure;
 const worker=async()=>{
  while(!failure&&!isCancelled()&&cursor<jobs.length){
   const job=jobs[cursor++];
   try{await read(job);}catch(error){failure ||= error;}
  }
 };
 await Promise.all(Array.from({length:Math.min(jobs.length,normalizeReadConcurrency(concurrency))},worker));
 if(failure)throw failure;
 if(isCancelled())throw Object.assign(new Error('任务已停止，已保存的阅读记录可继续使用'),{name:'AbortError'});
}
