// UPDATE may change the heap order of rows sharing created_at. Keep the user's
// established order and use fresh rows; image/prompt status is never a sort key.
export function retainAssetOrder(previous=[],incoming=[]){
 const rows=new Map(incoming.map(row=>[row.id,row]));const result=[];
 for(const row of previous){if(rows.has(row.id)){result.push(rows.get(row.id));rows.delete(row.id);}}
 for(const row of incoming){if(rows.has(row.id)){result.push(rows.get(row.id));rows.delete(row.id);}}
 return result;
}
