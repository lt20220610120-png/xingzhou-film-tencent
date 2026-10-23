const crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
function addCalendarMonth(value){
 const local=new Date(new Date(value).getTime()+8*3600000);
 if(!Number.isFinite(local.getTime()))throw Error('日期无效');
 const day=local.getUTCDate();local.setUTCDate(1);local.setUTCMonth(local.getUTCMonth()+1);
 const last=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+1,0)).getUTCDate();
 local.setUTCDate(Math.min(day,last));return new Date(local.getTime()-8*3600000).toISOString();
}
function generateCard(){return 'XZ-'+crypto.randomBytes(24).toString('hex').toUpperCase().match(/.{8}/g).join('-');}
function cardDigest(value){const raw=String(value||'').trim().toUpperCase().replaceAll('-','');if(!/^XZ[A-F0-9]{48}$/.test(raw))throw Object.assign(Error('卡密格式不正确'),{status:400});return hash(raw);}
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
function proofMessage({action,payload,token,nonce}){return Buffer.from(canonical({protocol:1,action,payload,tokenHash:hash(token||''),nonce}));}
function normalizePublicKey(pem){const key=crypto.createPublicKey(pem);if(key.asymmetricKeyType!=='ed25519')throw Error('设备密钥无效');return key.export({type:'spki',format:'pem'});}
function verifyDeviceProof(value){try{return crypto.verify(null,proofMessage(value),normalizePublicKey(value.publicKey),Buffer.from(value.signature,'base64'));}catch{return false;}}
function licenseDecision(user,grant,now=Date.now(),deviceKey){
 if(user?.banned)return {status:'banned',allowed:false};
 if(user?.exempt===true)return {status:'exempt',allowed:true};
 if(!grant)return {status:'required',allowed:false};
 const expiresAt=new Date(grant.expires_at).toISOString();
 if(grant.device_key!==deviceKey)return {status:grant.device_key?'other-device':'unbound',allowed:false,expiresAt};
 if(grant.revoked)return {status:'revoked',allowed:false,expiresAt};
 return {status:Date.parse(expiresAt)>now?'active':'expired',allowed:Date.parse(expiresAt)>now,expiresAt};
}
module.exports={hash,canonical,addCalendarMonth,generateCard,cardDigest,proofMessage,normalizePublicKey,verifyDeviceProof,licenseDecision};
