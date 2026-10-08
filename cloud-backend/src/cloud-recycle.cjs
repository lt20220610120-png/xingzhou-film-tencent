// Active projects and projects still recoverable in the cloud protect their
// director source. Malformed/missing deletion deadlines fail closed.
function sourceProtection(row,now=Date.now()) {
 const markers=[...String(row.genre||'').matchAll(/\[RECYCLE_UNTIL:([^\]]*)\]/g)].map(m=>m[1]);
 const deadlines=[row.purge_after,...markers].filter(v=>v!==undefined&&v!==null);
 if(!row.deleted_at&&!deadlines.length&&!String(row.genre||'').includes('[RECYCLE_UNTIL:'))return 'active';
 const times=deadlines.map(v=>new Date(v).getTime());
 if(!times.length||times.some(t=>!Number.isFinite(t)))return 'unknown';
 return times.some(t=>t<=now)?'expired':'recycle';
}
function referencesDirector(link,director) {
 const aliases=new Set([director.id,`cloud-${director.id}`,director.analysis_output].filter(Boolean));
 const sources=[link.director_project_id,...[...String(link.genre||'').matchAll(/\[COLLAB_SOURCE:([^\]]+)\]/g)].map(m=>m[1])];
 return sources.some(source=>aliases.has(source));
}
module.exports={sourceProtection,referencesDirector};
