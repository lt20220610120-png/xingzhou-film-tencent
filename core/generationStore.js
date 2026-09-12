import { uid, now } from './projectStore.js';
export const createGenerationTask=(input={})=>({id:uid(),createdAt:now(),updatedAt:now(),status:'pending',kind:'image',prompt:'',...input});
export const updateGenerationTask=(tasks,id,updates)=>tasks.map(t=>t.id===id?{...t,...updates,updatedAt:now()}:t);
export const generationHistory=(tasks)=>tasks.filter(t=>['success','failure'].includes(t.status));
export const removeGenerationTask=(tasks,id)=>tasks.filter(t=>t.id!==id);
