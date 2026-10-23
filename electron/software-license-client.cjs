const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {proofMessage}=require('../cloud-backend/shared/software-license.cjs');
const PAID=new Set(['ai-chat','test-ai-connection','generation-submit','media-generate-image','media-generate-video','collab-generate-asset-image','collab-generate-video']);
function createLicenseClient({directory,safeStorage,call,token,version,onChange=()=>{}}){
 let key,activation='',epoch=0,last={status:'unchecked',allowed:false},checked=0;
 const keyFile=path.join(directory,'software-device-key.json');
 function identity(){
  if(key)return key;
  if(!safeStorage?.isEncryptionAvailable())throw Error('系统设备密钥保护暂不可用，请重试');
  if(fs.existsSync(keyFile)){try{key=JSON.parse(safeStorage.decryptString(Buffer.from(JSON.parse(fs.readFileSync(keyFile,'utf8')).encrypted,'base64')));crypto.createPrivateKey(key.privateKey);return key;}catch{throw Error('本机设备密钥无法读取，请联系管理员解绑后恢复');}}
  const pair=crypto.generateKeyPairSync('ed25519');key={privateKey:pair.privateKey.export({type:'pkcs8',format:'pem'}),publicKey:pair.publicKey.export({type:'spki',format:'pem'})};
  const encrypted=safeStorage.encryptString(JSON.stringify(key)).toString('base64');fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(keyFile,JSON.stringify({version:1,encrypted}),{flag:'wx',mode:0o600});return key;
 }
 function update(state){last=state;checked=Date.now();onChange({...state});return {...state};}
 async function decorate(action,payload={},bearer=''){
  if(action==='license-challenge')return payload;
  let id;try{id=identity();}catch(error){if(['login','session','license-check','recover','send-email-code','logout'].includes(action))return payload;throw error;}
  const {nonce}=await call('license-challenge',{publicKey:id.publicKey});
  const value={...payload,_licenseVersion:version,...(activation&&['login','register','license-redeem'].includes(action)?{_licenseActivation:activation}:{})};
  const signature=crypto.sign(null,proofMessage({action,payload:value,token:bearer,nonce}),id.privateKey).toString('base64');
  return {...value,_licenseProof:{publicKey:id.publicKey,nonce,signature}};
 }
 async function check(){const expected=epoch,bearer=token();try{const result=await call('license-check',{},bearer);if(expected!==epoch||bearer!==token())throw Error('账号已切换，请重新校验');return update(result);}catch(error){if(expected===epoch)update({status:'error',allowed:false,error:error.message});throw error;}}
 return {
  decorate,check,state:()=>({...last}),
  reset(){epoch++;activation='';update({status:'unchecked',allowed:false});},
  async prepare(code){const r=await call('license-prepare',{code});activation=r.activationToken;return {prepared:true,expiresIn:r.expiresIn};},
  async redeem(){const r=await call('license-redeem',{},token());activation='';return update(r);},
  authenticated(){activation='';epoch++;checked=0;},
  async requireActive(force=true){const value=force||Date.now()-checked>=60000?await check():last;if(!value.allowed)throw Error('软件授权未生效或已到期，请在启动授权页续卡；已提交任务和资料仍可保存、查询与导出');return value;},
  needsLicense(channel){return PAID.has(channel)||/^(chatgpt-web|doubao-work|gemini-web|libtv-login|like-pairing|like-bind|import-full-script|import-skill|discover-models|admin-workflow-(?:create|start|resume))/.test(channel);},
 };
}
module.exports={createLicenseClient};
