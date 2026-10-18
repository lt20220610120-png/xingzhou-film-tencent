"""Deploy code + owner-provided private vault without putting Skill documents in a release/source package."""
from pathlib import Path
import subprocess, shutil, hashlib
ROOT=Path(__file__).resolve().parents[1]
stage=ROOT/'output/protected2850-deploy'
stage.mkdir(exist_ok=True)
for src,dest in [('cloud-backend/src/protected-skills.cjs','protected-skills.cjs'),('cloud-backend/src/server.cjs','server.cjs'),('electron/ai-service.cjs','skill-text.cjs'),('electron/cloud-ip-ca.pem','skill-cloud-ip-ca.pem')]:
    shutil.copyfile(ROOT/src,stage/dest)
transport=(ROOT/'electron/win-ai-transport.cjs').read_text(encoding='utf-8').replace("'./cloud-config.public.cjs'","'./skill-cloud-config.cjs'")
(stage/'skill-win-ai-transport.cjs').write_text(transport,encoding='utf-8')
config=(ROOT/'electron/cloud-config.public.cjs').read_text(encoding='utf-8').replace("'cloud-ip-ca.pem'","'skill-cloud-ip-ca.pem'")
(stage/'skill-cloud-config.cjs').write_text(config,encoding='utf-8')
shell=r'''#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-protected2850-stage
backup=/opt/xingzhou-backups/protected-skills-2.8.50-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/server.cjs" | cut -d' ' -f1)" = 00b9535ef4e1f9a44e31a4b0fcf02612ce1cc7c5a0c83bdab52bc2cb4acd09d8
node --check "$stage/server.cjs"
node --check "$stage/protected-skills.cjs"
mkdir -m 700 -p "$backup"
cp -a "$live/src/server.cjs" "$backup/"
for file in protected-skills.cjs skill-text.cjs skill-win-ai-transport.cjs skill-cloud-config.cjs skill-cloud-ip-ca.pem; do
 if test -f "$live/src/$file"; then cp -a "$live/src/$file" "$backup/"; fi
done
rollback(){ trap - ERR; cp -a "$backup/server.cjs" "$live/src/server.cjs"; systemctl restart xingzhou-cloud-backend; echo "PROTECTED_ROLLBACK $backup" >&2; }
trap rollback ERR
install -d -m 700 -o ubuntu -g ubuntu /opt/xingzhou-private-skills
for name in video-prompt-fast-v8-2 video-prompt-vertical-creator-v2 video-prompt-horizontal-creator; do
 if test -f "/opt/xingzhou-private-skills/$name.json"; then cp -a "/opt/xingzhou-private-skills/$name.json" "$backup/"; fi
 install -m 600 -o ubuntu -g ubuntu "$stage/$name.json" "/opt/xingzhou-private-skills/$name.json"
done
for file in protected-skills.cjs skill-text.cjs skill-win-ai-transport.cjs skill-cloud-config.cjs skill-cloud-ip-ca.pem server.cjs; do install -m 644 "$stage/$file" "$live/src/$file"; done
systemctl restart xingzhou-cloud-backend
healthy=false
for n in $(seq 1 15); do if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi; sleep 1; done
test "$healthy" = true
sudo -u ubuntu node "$stage/verify.cjs"
systemctl is-active xingzhou-cloud-backend
trap - ERR
echo "PROTECTED_DEPLOYED backup=$backup"
'''
(stage/'deploy.sh').write_text(shell,encoding='utf-8',newline='\n')
verify=r'''const assert=require('node:assert/strict'),fs=require('node:fs');
const {createProtectedSkills,protectedFetch,trustedEndpoint}=require('/opt/xingzhou-cloud-backend/src/protected-skills.cjs');
(async()=>{let requested=0;const service=createProtectedSkills({validateEndpoint:async value=>trustedEndpoint(value),requestText:async config=>{requested++;assert(config.messages[0].content.length>3000);assert(!config.messages.some(m=>m.content===''));return 'isolated-fixture-output';}});
 for(const [i,name]of ['video-prompt-fast-v8-2','video-prompt-vertical-creator-v2','video-prompt-horizontal-creator'].entries()){
  const file='/opt/xingzhou-private-skills/'+name+'.json';assert.equal(fs.statSync(file).mode&0o777,0o600);const privateSkill=JSON.parse(fs.readFileSync(file));assert(privateSkill.content.length>2000);
  const taskId='private-runtime-'+i,p={taskId,skillId:'builtin:'+name,input:'仅用于隔离功能验证',profile:{endpoint:'https://api.openai.com/v1',model:'fixture',apiKey:'synthetic-no-paid-call'}};
  assert.equal((await service('protected-skill-start',p,{id:'isolated-fixture'})).status,200);
  await new Promise(r=>setTimeout(r,30));const result=await service('protected-skill-status',{taskId},{id:'isolated-fixture'});assert.equal(result.body.output,'isolated-fixture-output');assert(!JSON.stringify(result).includes(privateSkill.content.slice(0,80)));
 }
 const res=await fetch('http://127.0.0.1:4310/api/gateway',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'protected-skill-start',taskId:'no-auth-test'})});assert.equal(res.status,401);
 const winAI=await protectedFetch('https://winai.xingzhoufilm.cn/v1/models',{method:'GET'});assert([401,403].includes(winAI.status));
 console.log(JSON.stringify({protectedSkills:requested,privateMode600:true,noSourceReturned:true,noAuth401:true,winAITlsPinned:winAI.status,paidRequests:0}));
})().catch(e=>{console.error('Protected verification failed: '+e.message);process.exitCode=1;});'''
(stage/'verify.cjs').write_text(verify,encoding='utf-8')
opts=['-i',str(Path.home()/'.ssh/xingzhou_tencent_test'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o',f'UserKnownHostsFile={Path.home()/".ssh/known_hosts_xingzhou"}']
host='ubuntu@106.55.41.128'
files=list(stage.iterdir())+list((ROOT/'output/protected-skill-vault-2850').glob('*.json'))
subprocess.run(['scp',*opts,*map(str,files),host+':/home/ubuntu/xingzhou-protected2850-stage/'],check=True)
subprocess.run(['ssh',*opts,host,'sudo bash /home/ubuntu/xingzhou-protected2850-stage/deploy.sh'],check=True)
