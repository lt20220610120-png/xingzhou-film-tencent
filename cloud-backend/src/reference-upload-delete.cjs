// This policy applies only to the storyboard upload picker, never asset/voice management.
function validReferenceObject(row){
 const prefix=`projects/${row.project_id}/${row.kind}/`,key=String(row.object_path||'');
 return /^[a-zA-Z0-9_-]+$/.test(String(row.project_id||''))&&key.startsWith(prefix)&&/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(key.slice(prefix.length));
}
function publishedReferenceUses(project,row){
 const key=row.object_path;
 const matches=value=>{
  if(typeof value==='string'){
   if(value===row.id||value===key)return true;
   try{return decodeURIComponent(new URL(value).pathname).replace(/^\//,'')===key;}catch{return false;}
  }
  return value&&typeof value==='object'&&Object.values(value).some(matches);
 };
 // Published director prompts and review data are immutable from this picker.
 // Working storyboard references are deliberately excluded so an upload can be
 // removed from the editable draft independently of the selection dialog.
 if(matches(project.analysis_progress)||matches(project.voiceProfiles))return true;
 return (Array.isArray(project.episodes)?project.episodes:[]).some(ep=>matches(ep.prompts)||matches(ep.voiceProfiles));
}
module.exports={validReferenceObject,publishedReferenceUses};
