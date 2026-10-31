const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {proofMessage}=require('../cloud-backend/shared/software-license.cjs');
const PAID=new Set(['ai-chat','test-ai-connection','generation-submit','media-generate-image','media-generate-video','collab-generate-asset-image','collab-generate-video']);
PAID.add('audio-generate');
function createLicenseClient({directory,safeStorage,call,token,version,onChange=()=>{}}){
 let key,activation='',epoch=0,last={status:'unchecked',allowed:false},checked=0,exemptToken='',routedToken=null,kind='unknown';
 const keyFile=path.join(directory,'software-device-key.json');
 const hintFile=path.join(directory,'software-license-route.json');
 let monthlyHint=false;try{monthlyHint=JSON.parse(fs.readFileSync(hintFile,'utf8')).monthly===true;}catch{}
 const isExempt=()=>Boolean(exemptToken&&exemptToken===token());
 function rememberMonthly(){monthlyHint=true;fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(hintFile,JSON.stringify({monthly:true}));}
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
  if(['license-route','license-challenge','recover','send-email-code'].includes(action))return payload;
  if(bearer&&bearer===exemptToken)return payload;
  if(action==='login'&&!activation&&kind!=='monthly')return payload;
  let id;try{id=identity();}catch(error){if(['login','session','license-check','recover','send-email-code','logout'].includes(action))return payload;throw error;}
  const {nonce}=await call('license-challenge',{publicKey:id.publicKey});
  const value={...payload,_licenseVersion:version,...(activation&&['login','register','license-redeem'].includes(action)?{_licenseActivation:activation}:{})};
  const signature=crypto.sign(null,proofMessage({action,payload:value,token:bearer,nonce}),id.privateKey).toString('base64');
  return {...value,_licenseProof:{publicKey:id.publicKey,nonce,signature}};
 }
 async function route(username){const expected=epoch,bearer=token(),r=await call('license-route',{...(username?{username}:{})},username?'':bearer);if(expected!==epoch||bearer!==token())throw Error('账号已切换，请重新操作');
  exemptToken='';routedToken=bearer;kind=r.status;
  if(r.status==='exempt'&&r.authenticated&&bearer&&!username){exemptToken=bearer;monthlyHint=false;try{fs.unlinkSync(hintFile);}catch{}return update(r);}
  if(r.status==='monthly'){rememberMonthly();return update({status:'required',allowed:false,authenticated:r.authenticated});}
  if(!username&&monthlyHint){kind='monthly';return update({status:'required',allowed:false,authenticated:false});}
  return update({...r,allowed:false});
 }
 async function check(){const expected=epoch,bearer=token();try{
  if(isExempt())return {...last,status:'exempt',allowed:true};
  if(routedToken!==bearer){await route();if(isExempt())return {...last};}
  if(kind!=='monthly'&&!monthlyHint)return {...last,allowed:false};
  kind='monthly';const result=await call('license-check',{},bearer);if(expected!==epoch||bearer!==token())throw Error('账号已切换，请重新校验');return update(result);
 }catch(error){if(expected===epoch)update({status:kind==='monthly'||monthlyHint?'error':'account-error',allowed:false,error:error.message});throw error;}}
 return {
  decorate,check,route,state:()=>({...last}),shouldHeartbeat:()=>!isExempt()&&(kind==='monthly'||monthlyHint),
  reset({forgetRoute=false}={}){epoch++;activation='';exemptToken='';routedToken=null;kind='unknown';if(forgetRoute){monthlyHint=false;try{fs.unlinkSync(hintFile);}catch{}}update({status:'unchecked',allowed:false});},
  async prepare(code){const expected=epoch,bearer=token();kind='monthly';const r=await call('license-prepare',{code});if(expected!==epoch||bearer!==token())throw Error('账号已切换，请重新验证卡密');rememberMonthly();activation=r.activationToken;return {prepared:true,expiresIn:r.expiresIn};},
  async redeem(){const expected=epoch,bearer=token(),r=await call('license-redeem',{},bearer);if(expected!==epoch||bearer!==token())throw Error('账号已切换，请重新校验');activation='';return update(r);},
  authenticated(){activation='';epoch++;checked=0;exemptToken='';routedToken=null;},
  async requireActive(force=true){const value=isExempt()?{status:'exempt',allowed:true}:force||Date.now()-checked>=60000?await check():last;if(!value.allowed)throw Error('软件授权未生效或已到期，请在启动授权页续卡后进入软件');return value;},
  needsLicense(channel){return PAID.has(channel)||/^(chatgpt-web|doubao-work|gemini-web|libtv-login|like-pairing|like-bind|import-full-script|import-skill|discover-models|admin-workflow-(?:create|start|resume))/.test(channel);},
 };
}
module.exports={createLicenseClient};
