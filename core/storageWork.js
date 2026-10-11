// Keep the whole workflow active, including gaps between individual AI calls.
let active=0;
export const storageWorkBusy=()=>active>0;
export async function withStorageWork(task){active++;try{return await task();}finally{active--;}}
