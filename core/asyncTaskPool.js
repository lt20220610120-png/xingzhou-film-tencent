// Each stage has a bounded lane; downstream tasks can run while upstream waits.
export function createTaskPool(limit=4){
 let active=0;const queue=[];
 const pump=()=>{while(active<limit&&queue.length){const {task,resolve,reject}=queue.shift();active++;Promise.resolve().then(task).then(resolve,reject).finally(()=>{active--;pump();});}};
 return {run:task=>new Promise((resolve,reject)=>{queue.push({task,resolve,reject});pump();}),get active(){return active},get queued(){return queue.length}};
}
