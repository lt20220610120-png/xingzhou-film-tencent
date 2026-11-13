// A focused scene wins briefly; older background work eventually wins too.
export function taskPriority(priority,queuedAt,now=Date.now()){
 const value=typeof priority==='function'?priority():priority;
 return (Number.isFinite(value)?value:0)+Math.floor(Math.max(0,now-queuedAt)/10000);
}
