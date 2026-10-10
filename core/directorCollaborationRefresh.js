/** A clean master editor follows shared updates; an unsubmitted draft stays local. */
export function reconcileDirectorMasterDraft(draft,previous,incoming){
 if(previous?.id!==incoming?.id || draft===(previous?.script||''))return incoming?.script||'';
 return draft;
}

/** Refresh only reads: every member's local draft is published explicitly. */
export async function refreshDirectorCollaboration({getProject,flushEdits,readCloud,applyCloud}){
 flushEdits();
 let project=getProject();
 if(!project?.cloudProjectId)throw new Error('项目尚未开启云协作');
 const localId=project.id,cloudId=project.cloudProjectId;
 const checkIdentity=()=>{const current=getProject();if(current?.id!==localId||current.cloudProjectId!==cloudId)throw new Error('项目已切换，请在当前项目刷新');return current;};
 // Older linked projects may not have received their initial merge baseline.
 if(!project.cloudBase){const first=await readCloud(cloudId);checkIdentity();applyCloud(first);project=checkIdentity();}
 checkIdentity();
 const cloud=await readCloud(cloudId);checkIdentity();applyCloud(cloud);
 const current=checkIdentity();
 if(current.cloudConflict)throw new Error(`协作版本存在冲突，本地修改已保留：${current.cloudConflict}`);
 return cloud;
}
