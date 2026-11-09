const crypto=require('node:crypto');
function voiceDataScope(directory){return crypto.createHash('sha256').update(String(directory)).digest('hex');}
async function assertVoiceTarget(target,{context,getProject}){
 if(!target)return;
 const check=()=>{const now=context();if(!target.accountId||target.accountId!==now.accountId||!target.dataScope||target.dataScope!==now.dataScope)throw Error('账号或资料目录已变化，音色排队任务已停止');};
 check();const project=await getProject(target.projectId);check();
 if(!project||project.locked||!['producer','artist','artist_collaborator'].includes(project.myRole))throw Error('项目已锁定或没有音色生成权限，音色排队任务已停止');
}
module.exports={voiceDataScope,assertVoiceTarget};
