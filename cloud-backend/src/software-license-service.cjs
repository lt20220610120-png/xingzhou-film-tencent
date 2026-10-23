const {cardDigest,generateCard,normalizePublicKey,verifyDeviceProof,licenseDecision}=require('../shared/software-license.cjs');
const READ_ONLY=new Set(['session','logout','profile-update','project-list','project-get','director-project-list','director-project-get','director-version-list','director-version-get','members-list','assets-list','tasks-list','media-list','messages-list','stats-get','asset-image-url','media-download-url','generation-refresh','generation-reference-list','generation-reference-release','generation-reference-cleanup','protected-skill-status','protected-skill-cancel','producer-status','is-producer']);
const fail=(message,status=403)=>{throw Object.assign(Error(message),{status});};
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const supportedVersion=value=>{const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(String(value||''));if(!match)return false;const [major,minor,patch]=match.slice(1).map(Number);return major>2||(major===2&&(minor>8||(minor===8&&patch>=66)));};
function createLicenseService(repo){
 async function device(action,raw,token){
  const {_licenseProof:proof,action:ignoredAction,...payload}=raw||{};
  if(!proof||typeof proof.publicKey!=='string'||proof.publicKey.length>256)fail('请更新软件并完成设备激活');
  if(!supportedVersion(payload._licenseVersion))fail('请安装最新版本后使用卡密');
  if(typeof proof.nonce!=='string'||proof.nonce.length>100||typeof proof.signature!=='string'||proof.signature.length>128||!verifyDeviceProof({publicKey:proof.publicKey,signature:proof.signature,action,payload,token,nonce:proof.nonce}))fail('设备证明无效');
  const key=normalizePublicKey(proof.publicKey);
  if(!await repo.licenseConsumeChallenge(proof.nonce,key))fail('设备挑战已过期或已使用，请重试');
  return key;
 }
 async function decision(user,key){const state=await repo.licenseState(user?.id,key),result=licenseDecision({...user,exempt:state.exempt,banned:user?.banned||state.grant?.banned},state.grant,Date.now(),key);return {...result,authenticated:Boolean(user),canSettle:Boolean(user&&!user.banned&&state.grant&&(state.knownDevice||state.grant.device_key===key)),leaseSeconds:60};}
 async function authorize(action,payload,token,user){
  if(user?.banned)fail('账号已停用');
  const state=await repo.licenseState(user?.id,'');
  if(state.exempt)return {status:'exempt',allowed:true};
  const key=await device(action,payload,token),result=await decision(user,key);
  if(!result.allowed&&!(READ_ONLY.has(action)&&result.canSettle))fail('软件授权无效或已到期，请续卡或联系管理员');
  return result;
 }
 async function beforeLogin(user,key,activation){
  const state=await repo.licenseState(user.id,key);if(state.exempt)return;
  if(!key)fail('新用户请先输入卡密激活设备');
  if(activation&&await repo.licensePending(activation,key)){
   if(state.grant?.device_key&&state.grant.device_key!==key)fail('授权已绑定其他电脑，请联系管理员解绑');
   if(state.grant?.revoked)fail('授权已撤销，请联系管理员');return;
  }
  if(state.grant&&!state.grant.device_key&&!state.grant.revoked){await repo.licenseBind(key,user.id);return;}
  if(state.grant?.device_key===key)return; // Expired/revoked identity: read-only settlement only.
  if(state.knownDevice)return;
  fail('请先激活卡密；换机或重装请联系管理员解绑');
 }
 async function afterLogin(user,key,activation){const state=await repo.licenseState(user.id,key);if(!state.exempt&&activation)await repo.licenseRedeem(activation,key,user.id);return decision(user,key);}
 async function publicAction(action,payload,token,user){
  if(action==='license-challenge'){
   let key;try{if(String(payload.publicKey||'').length>256)throw Error();key=normalizePublicKey(payload.publicKey);}catch{fail('设备公钥无效',400);}
   return {nonce:await repo.licenseChallenge(key),protocol:1};
  }
  // Legacy exemption is an authenticated server record, never a client flag.
  if(action==='license-check'&&user&&(await repo.licenseState(user.id,'')).exempt)return decision(user,'');
  const key=await device(action,payload,token);
  if(action==='license-check')return decision(user,key);
  if(action==='license-prepare')return repo.licensePrepare(cardDigest(payload.code),key);
  if(action==='license-redeem'){
   if(!user||user.banned)fail('请登录后完成续卡');
   await repo.licenseRedeem(payload._licenseActivation,key,user.id);return decision(user,key);
  }
  fail('授权操作不存在',404);
 }
 async function admin(action,payload,user){
  if(!user?.is_admin||user.banned)fail('需要管理员权限');
  if(action==='admin-license-overview')return repo.licenseOverview();
  if(action==='admin-license-issue'){
   if(payload.orderId&&(!uuid(payload.orderId)||!Number.isInteger(payload.monthNumber)||payload.monthNumber<1||payload.monthNumber>12))fail('请选择有效订单月份',400);
   const code=generateCard();const row=await repo.licenseIssue({digest:cardDigest(code),hint:code.slice(-8),note:String(payload.note||'').slice(0,300),orderId:payload.orderId,monthNumber:payload.monthNumber},user.id);return {...row,code};
  }
  if(action==='admin-license-order'){const note=String(payload.note||'').trim();if(!note||note.length>300)fail('请填写年度订单备注（最多300字）',400);return repo.licenseCreateOrder(note,user.id);}
  if(action==='admin-license-change'){
   const reason=String(payload.reason||'').trim();if(!uuid(payload.target)||!reason||reason.length>300||payload.confirmed!==true||!['unbind','revoke','restore','disable-card'].includes(payload.changeAction))fail('请选择操作，确认并填写原因（最多300字）',400);
   return repo.licenseAdminChange(payload.changeAction,payload.target,reason,user.id);
  }
  fail('授权管理操作不存在',404);
 }
 return {device,decision,authorize,beforeLogin,afterLogin,publicAction,admin};
}
module.exports={createLicenseService,READ_ONLY};
