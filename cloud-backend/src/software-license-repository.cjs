const crypto=require('node:crypto');
const {hash,addCalendarMonth}=require('../shared/software-license.cjs');
const {hashPassword}=require('./password.cjs');
const {digestInvite,inviteUsable,rolesForInvite,normalizeInviteCode}=require('./invites.cjs');
const {emailCodeValid}=require('./email-code.cjs');
const fail=(message,status=403)=>{throw Object.assign(Error(message),{status});};
function extendLicenseRepository(pool){
 async function tx(work){const c=await pool.connect();try{await c.query('begin');const r=await work(c);await c.query('commit');return r;}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
 const audit=(c,actor,action,target,reason='')=>c.query('insert into software_license_audit(actor_id,action,target,reason) values($1,$2,$3,$4)',[actor,action,target,reason]);
 const accountSelect='id,username,display_name,email,roles,active_role,is_admin,is_producer,banned,created_at,avatar_data,bio,profile_tags,password_hash';
 return {
  async licenseState(userId,deviceKey){
   const exempt=userId?Boolean((await pool.query('select 1 from software_license_exemptions where user_id=$1',[userId])).rowCount):false;
   const grant=(await pool.query('select l.*,u.banned from software_licenses l join app_users u on u.id=l.user_id where '+(userId?'l.user_id=$1':'l.device_key=$1'),[userId||deviceKey])).rows[0];
   const knownDevice=Boolean(userId&&deviceKey&&(await pool.query('select 1 from software_license_devices where user_id=$1 and device_key=$2',[userId,deviceKey])).rowCount);
   return {exempt,grant,knownDevice};
  },
  async licenseChallenge(deviceKey){const nonce=crypto.randomBytes(32).toString('base64url');await pool.query("delete from software_license_challenges where expires_at<now(); delete from software_license_pending where expires_at<now()");await pool.query("insert into software_license_challenges values($1,$2,now()+interval '90 seconds')",[nonce,deviceKey]);return nonce;},
  async licenseConsumeChallenge(nonce,key){return (await pool.query('delete from software_license_challenges where nonce=$1 and device_key=$2 and expires_at>now() returning nonce',[nonce,key])).rowCount===1;},
  async licensePrepare(digest,key){
   const row=(await pool.query('select id,disabled,redeemed_by from software_license_cards where digest=$1',[digest])).rows[0];
   if(!row||row.disabled||row.redeemed_by)fail('卡密无效、已停用或已兑换');
   const token=crypto.randomBytes(32).toString('base64url');
   await pool.query("insert into software_license_pending values($1,$2,$3,now()+interval '15 minutes')",[hash(token),row.id,key]);return {activationToken:token,expiresIn:900};
  },
  async licensePending(token,key){return (await pool.query('select p.card_id from software_license_pending p join software_license_cards c on c.id=p.card_id where p.token_hash=$1 and p.device_key=$2 and p.expires_at>now() and not c.disabled and c.redeemed_by is null',[hash(token),key])).rowCount===1;},
  async licenseRedeemInTransaction(c,token,key,userId){
   // Lock account first: serializes different cards and device rebinding for one user.
   const u=(await c.query('select banned from app_users where id=$1 for update',[userId])).rows[0];if(!u||u.banned)fail('账号不可用');
   if((await c.query('select 1 from software_license_exemptions where user_id=$1',[userId])).rowCount)fail('此老账号免卡密，无需兑换');
   const p=(await c.query('select * from software_license_pending where token_hash=$1 and device_key=$2 and expires_at>now()',[hash(token),key])).rows[0];if(!p)fail('激活凭证已过期，请重新输入卡密');
   const card=(await c.query('select * from software_license_cards where id=$1 for update',[p.card_id])).rows[0];
   const grant=(await c.query('select * from software_licenses where user_id=$1 for update',[userId])).rows[0];
   if(card?.disabled)fail('卡密已停用');
   if(grant?.revoked)fail('授权已撤销，请联系管理员处理');
   if(grant?.device_key&&grant.device_key!==key)fail('授权已绑定其他电脑，请联系管理员解绑');
   const other=(await c.query('select user_id from software_licenses where device_key=$1 and user_id<>$2',[key,userId])).rows[0];if(other)fail('此电脑已绑定其他账号');
   if(card.redeemed_by){if(card.redeemed_by===userId&&grant?.device_key===key)return grant;fail('此卡已由其他账号兑换');}
   if(card.order_id){const order=(await c.query('select * from software_license_orders where id=$1 for update',[card.order_id])).rows[0];if(order.user_id&&order.user_id!==userId)fail('年度订单已绑定其他账号');await c.query('update software_license_orders set user_id=$2 where id=$1',[card.order_id,userId]);}
   const now=(await c.query('select clock_timestamp() as now')).rows[0].now;
   const expires=addCalendarMonth(Math.max(new Date(now).getTime(),new Date(grant?.expires_at||0).getTime()));
   const r=await c.query('insert into software_licenses(user_id,device_key,expires_at) values($1,$2,$3) on conflict(user_id) do update set device_key=$2,expires_at=$3,updated_at=now() returning *',[userId,key,expires]);
   await c.query('insert into software_license_devices(user_id,device_key) values($1,$2) on conflict do nothing',[userId,key]);
   await c.query('update software_license_cards set redeemed_by=$2,redeemed_at=now() where id=$1',[card.id,userId]);await audit(c,userId,'redeem',card.id);return r.rows[0];
  },
  async licenseRedeem(token,key,userId){return tx(c=>this.licenseRedeemInTransaction(c,token,key,userId));},
  async registerAndRedeem(payload,key,activation){return tx(async c=>{
   const username=String(payload?.username||'').trim().toLowerCase(),email=String(payload?.email||'').trim().toLowerCase(),password=String(payload?.password||''),requestedRole=payload?.requestedRole==='director'?'director':'creator',inviteCode=normalizeInviteCode(payload?.inviteCode);
   if(!/^[a-z0-9_]{3,32}$/.test(username)||password.length<6||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)||!inviteCode)throw Object.assign(Error('账号、邮箱或密码格式不正确'),{status:400});
   const code=(await c.query('select email,code_hash,expires_at from email_codes where email=$1 for update',[email])).rows[0];if(!emailCodeValid(code,payload?.emailCode))fail('邮箱验证码无效或已过期',400);
   const invite=(await c.query('select id,code,kind,role,max_uses,used_count,disabled from invites where digest=$1 for update',[digestInvite(inviteCode)])).rows[0];if(!inviteUsable(invite))fail('邀请码无效、已停用或已用完',400);const grant=rolesForInvite(invite,requestedRole);if(grant.error)fail(grant.error,400);
   if((await c.query('select 1 from app_users where username=$1 or email=$2',[username,email])).rowCount)fail('账号或邮箱已存在',409);
   // Validate and lock the pending card before any registration side effects.
   const pending=(await c.query('select * from software_license_pending where token_hash=$1 and device_key=$2 and expires_at>now()',[hash(activation),key])).rows[0];if(!pending)fail('激活凭证已过期，请重新输入卡密',403);
   const card=(await c.query('select * from software_license_cards where id=$1 for update',[pending.card_id])).rows[0];if(!card||card.disabled||card.redeemed_by)fail('卡密已被兑换或作废',403);
   const user=(await c.query('insert into app_users (username,display_name,email,password_hash,roles,active_role,is_admin,is_producer) values($1,$2,$3,$4,$5,$6,$7,$8) returning '+accountSelect,[username,String(payload.displayName||username).trim(),email,hashPassword(password),grant.roles,grant.roles.includes(requestedRole)?requestedRole:grant.roles[0],grant.isAdmin,grant.isProducer])).rows[0];
   const used=await c.query('update invites set used_count=used_count+1 where id=$1 and (max_uses is null or used_count<max_uses) returning id',[invite.id]);if(!used.rowCount)fail('邀请码已用完，请重新获取',400);await c.query('delete from email_codes where email=$1',[email]);
   const token=crypto.randomUUID()+'-'+crypto.randomUUID();const license=await this.licenseRedeemInTransaction(c,activation,key,user.id);await c.query('insert into app_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval \'7 days\')',[user.id,hash(token)]);return {user,token,license};
  });},
  async licenseBind(key,userId){return tx(async c=>{await c.query('select id from app_users where id=$1 for update',[userId]);const r=await c.query('update software_licenses set device_key=$1,previous_device_key=null,updated_at=now() where user_id=$2 and device_key is null and not revoked returning *',[key,userId]);if(r.rowCount)await c.query('insert into software_license_devices(user_id,device_key) values($1,$2) on conflict do nothing',[userId,key]);return r.rows[0];});},
  async licenseOverview(){const [cards,grants,exemptions,orders,events]=await Promise.all([
   pool.query('select id,hint,note,order_id,month_number,disabled,redeemed_by,redeemed_at,created_at from software_license_cards order by created_at desc limit 500'),
   pool.query('select l.*,u.username from software_licenses l join app_users u on u.id=l.user_id order by expires_at'),
   pool.query('select e.*,u.username from software_license_exemptions e join app_users u on u.id=e.user_id'),
   pool.query('select o.*,count(c.id) filter(where not c.disabled)::int as issued from software_license_orders o left join software_license_cards c on c.order_id=o.id group by o.id order by o.created_at desc'),
   pool.query('select * from software_license_audit order by id desc limit 100')]);return {cards:cards.rows,grants:grants.rows,exemptions:exemptions.rows,orders:orders.rows,audit:events.rows};},
  async licenseIssue(input,actor){return tx(async c=>{if(input.orderId){const o=(await c.query('select * from software_license_orders where id=$1 for update',[input.orderId])).rows[0];if(!o)fail('订单不存在');if((await c.query('select 1 from software_license_cards where order_id=$1 and month_number=$2 and disabled=false',[input.orderId,input.monthNumber])).rowCount)fail('这个月份已有有效卡；如需补发，请先作废原卡');}
   const r=await c.query('insert into software_license_cards(digest,hint,note,order_id,month_number) values($1,$2,$3,$4,$5) returning id,hint,note,created_at',[input.digest,input.hint,input.note,input.orderId||null,input.monthNumber||null]);await audit(c,actor,'issue',r.rows[0].id,input.note);return r.rows[0];});},
  async licenseCreateOrder(note,actor){return tx(async c=>{const r=await c.query('insert into software_license_orders(note) values($1) returning *',[note]);await audit(c,actor,'create-order',r.rows[0].id,note);return r.rows[0];});},
  async licenseAdminChange(action,target,reason,actor){return tx(async c=>{
   if(action==='disable-card'){const r=await c.query('update software_license_cards set disabled=true where id=$1 and redeemed_by is null returning id',[target]);if(!r.rowCount)fail('卡密不存在或已兑换，已兑换请撤销对应授权');}
   else {await c.query('select id from app_users where id=$1 for update',[target]);if((await c.query('select 1 from software_license_exemptions where user_id=$1',[target])).rowCount)fail('老账号豁免不参与卡密管理');
    const sql=action==='unbind'?'device_key=null,previous_device_key=device_key':action==='revoke'?'revoked=true':action==='restore'?'revoked=false':null;if(!sql)fail('操作无效');
    if(!(await c.query('update software_licenses set '+sql+',updated_at=now() where user_id=$1 returning user_id',[target])).rowCount)fail('授权不存在');}
   await audit(c,actor,action,target,reason);return {ok:true};
  });},
 };
}
module.exports={extendLicenseRepository};
