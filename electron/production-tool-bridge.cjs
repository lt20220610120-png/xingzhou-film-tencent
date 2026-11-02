const crypto=require('node:crypto');
function createProductionToolBridge(){const pending=new Map();return {
 request(sender,runId,name,args){return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error('行舟工具执行超时，未确认结果请重新读取状态'));},120000);pending.set(id,{sender:sender.id,runId,resolve,reject,timer});sender.send('production-agent-tool',{id,runId,name,args});});},
 respond(sender,p){const entry=pending.get(p.id);if(!entry||entry.sender!==sender.id||entry.runId!==p.runId)throw Error('工具回执身份不匹配');clearTimeout(entry.timer);pending.delete(p.id);p.error?entry.reject(Error(p.error)):entry.resolve(p.result);return true;}
};}
module.exports={createProductionToolBridge};
