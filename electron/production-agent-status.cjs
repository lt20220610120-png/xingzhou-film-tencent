// Only allowlisted presentation fields cross IPC. Never forward auth tokens,
// MCP URLs/headers, tool schemas, Skill bodies or arbitrary provider payloads.
function normalizeAgentStatus({account,limits,skills,mcp,errors={}},cwd){
 const buckets=limits?.rateLimitsByLimitId&&Object.keys(limits.rateLimitsByLimitId).length?Object.entries(limits.rateLimitsByLimitId):limits?.rateLimits?[['codex',limits.rateLimits]]:[];
 const windows=[];for(const [id,bucket]of buckets)for(const key of ['primary','secondary']){const w=bucket?.[key];if(w&&typeof w.usedPercent==='number'&&Number.isFinite(w.usedPercent))windows.push({id:id+':'+key,bucket:String(bucket.limitName||id).slice(0,100),minutes:typeof w.windowDurationMins==='number'?w.windowDurationMins:null,usedPercent:Math.min(100,Math.max(0,w.usedPercent)),resetsAt:typeof w.resetsAt==='number'?w.resetsAt:null});}
 const unique=new Map();for(const row of skills?.data||[])for(const s of row.skills||[]){const id=String(s.path||s.name);if(!unique.has(id))unique.set(id,{name:String(s.name||'').slice(0,200),enabled:s.enabled===true,scope:String(s.scope||''),description:String(s.description||'').slice(0,250)});}
 return {checkedAt:Date.now(),cwd,account:account?{type:String(account.type||''),email:String(account.email||'').slice(0,200),plan:String(account.planType||'').slice(0,80)}:null,windows,skills:skills?{items:[...unique.values()],enabled:[...unique.values()].filter(s=>s.enabled).length,total:unique.size,errors:(skills.data||[]).reduce((n,r)=>n+(r.errors?.length||0),0)}:null,mcp:mcp?{items:(mcp.data||[]).map(s=>({name:String(s.name||'').slice(0,200),status:String(s.runtimeStatus||s.startupStatus||s.connectionStatus||'unknown'),authStatus:String(s.authStatus||'unknown'),tools:Object.keys(s.tools||{}).length})),truncated:Boolean(mcp.nextCursor)}:null,errors};
}
async function readAgentStatus(request,account,cwd){
 const results=await Promise.allSettled([request('account/rateLimits/read',{},12000),request('skills/list',{cwds:[cwd],forceReload:false},12000),request('mcpServerStatus/list',{limit:100,detail:'toolsAndAuthOnly'},12000)]),data={account,errors:{}};
 for(const [i,key]of ['limits','skills','mcp'].entries()){const r=results[i];if(r.status==='fulfilled')data[key]=r.value;else data.errors[key]='接口未提供或暂时不可读取';}
 return normalizeAgentStatus(data,cwd);
}
module.exports={normalizeAgentStatus,readAgentStatus};
