import PQueue from 'p-queue';
import {taskPriority} from './taskPriority.js';

// Each stage has a bounded lane. Reprioritize waiting work, never an in-flight call.
export function createTaskPool(limit=4){
 const queue=new PQueue({concurrency:limit}),waiting=new Map();let sequence=0;
 const reprioritize=()=>{for(const [id,row]of waiting)queue.setPriority(id,taskPriority(row.priority,row.queuedAt));};
 return {run(task,{priority=0}={}){
  reprioritize();const id=String(++sequence),row={priority,queuedAt:Date.now()};waiting.set(id,row);
  const promise=queue.add(async()=>{waiting.delete(id);try{return await task();}finally{reprioritize();}},{id,priority:taskPriority(priority,row.queuedAt)});
  return promise;
 },reprioritize,get active(){return queue.pending},get queued(){return queue.size}};
}
