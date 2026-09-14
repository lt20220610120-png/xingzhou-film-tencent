const {publicAccount}=require('./auth.cjs');
async function updateProfile(payload,user,repo){
 if(!user)return {status:401,body:{error:'请先登录'}};
 const displayName=String(payload.displayName||'').trim(),bio=String(payload.bio||'').trim();
 const tags=Array.isArray(payload.tags)?[...new Set(payload.tags.map(x=>String(x).trim()).filter(Boolean))]:[];
 const avatar=String(payload.avatarData||'');
 if(!displayName||displayName.length>40||bio.length>160||tags.length>8||tags.some(t=>t.length>20))return {status:400,body:{error:'昵称最多40字，介绍最多160字，标签最多8个且每个20字'}};
 if(avatar&&(avatar.length>240000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(avatar)))return {status:400,body:{error:'头像格式或大小不正确，请重新选择图片'}};
 const row=await repo.updateProfile(user.id,{displayName,bio,tags,avatar});
 return row?{status:200,body:{account:publicAccount(row)}}:{status:404,body:{error:'账号不存在'}};
}
module.exports={updateProfile};
