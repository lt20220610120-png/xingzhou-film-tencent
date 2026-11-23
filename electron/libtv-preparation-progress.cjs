const operationPattern=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const stages=new Set(['checking','uploading','creating','submitting']);

function createLibTVProgressOperations(){
 const active=new Map();
 return {
  start(operationId,sender,identitySignal){
   if(typeof operationId!=='string'||!operationPattern.test(operationId)||active.has(operationId))throw Error('LibTV 准备编号无效，请重新操作');
   const controller=new AbortController();
   const signal=identitySignal?AbortSignal.any([controller.signal,identitySignal]):controller.signal;
   const entry={sender,controller,signal,cancellable:true};
   const report=({stage,completed,total}={})=>{
    if(signal.aborted||!stages.has(stage)||sender.isDestroyed()||active.get(operationId)!==entry)return;
    const message={operationId,stage,cancellable:entry.cancellable};
    if(stage==='uploading'&&Number.isInteger(total)&&total>=0&&total<=256&&Number.isInteger(completed)&&completed>=0&&completed<=total){
     message.completed=completed;
     message.total=total;
    }
    try{sender.send('libtv-preparation-progress',message);}catch{/* Sender closed between check and send. */}
   };
   active.set(operationId,entry);
   return {
    signal,report,
    commit(){entry.cancellable=false;report({stage:'submitting'});},
    finish(){if(active.get(operationId)===entry)active.delete(operationId);},
   };
  },
  cancel(operationId,sender){
   const entry=active.get(operationId);
   if(!entry?.cancellable||entry.sender!==sender||entry.signal.aborted)return false;
   entry.controller.abort(Error('已取消 LibTV 生成准备，未提交生成'));
   return true;
  },
 };
}
module.exports={createLibTVProgressOperations};
