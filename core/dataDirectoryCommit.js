export async function commitDirectoryChange({snapshot,getState,prepared,api}){
 if(getState()!==snapshot){if(prepared.migrationId)await api.cancelDataDir?.({migrationId:prepared.migrationId});throw new Error('迁移期间有新的编辑或生成结果，内容已保留在原目录，请任务完成后重试');}
 if(prepared.migrationId)return api.commitDataDir({migrationId:prepared.migrationId});
 return prepared;
}
