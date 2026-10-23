import base64,pathlib,subprocess,json
ROOT=pathlib.Path(__file__).resolve().parents[2]
source=(ROOT/'src/assets/wink-ai-icon.png').read_bytes()
svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 270 246"><image width="270" height="246" href="data:image/png;base64,'+base64.b64encode(source).decode()+'"/></svg>'
(ROOT/'win-ai/public/brand.svg').write_text(svg,encoding='utf-8')
for name in ['nginx.conf','ip-https.conf']:
 p=ROOT/'win-ai'/name
 text=p.read_text(encoding='utf-8').replace('gzip_types text/css application/javascript application/json;','gzip_types text/css text/javascript application/javascript application/json;')
 text=text.replace("sub_filter '</head>' '<script", "sub_filter '</head>' '<link rel=\"icon\" href=\"/brand.svg?v=2869\"><script")
 p.write_text(text,encoding='utf-8')
OPTIONS=['-i',str(pathlib.Path.home()/'.ssh/xingzhou_tencent_test'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(pathlib.Path.home()/'.ssh/known_hosts_xingzhou')]
# Incremental deployment: preserve credentials, upstream configuration and all application data.
remote=r'''
import base64,pathlib,datetime,shutil,subprocess,json,hashlib
payload=json.loads(PAYLOAD)
paths=[pathlib.Path('/etc/nginx/conf.d/win-ai.conf'),pathlib.Path('/etc/nginx/conf.d/win-ai-ip-https.conf')]
updates={}
for p in paths:
 text=p.read_text()
 old="gzip_types text/css application/javascript application/json;"
 new="gzip_types text/css text/javascript application/javascript application/json;"
 if old not in text and new not in text:raise SystemExit('Unexpected gzip configuration: '+str(p))
 text=text.replace(old,new)
 oldhead="sub_filter '</head>' '<script"
 newhead="sub_filter '</head>' '<link rel=\"icon\" href=\"/brand.svg?v=2869\"><script"
 if oldhead not in text and newhead not in text:raise SystemExit('Unexpected head configuration: '+str(p))
 text=text.replace(oldhead,newhead)
 updates[p]=text.encode()
icon=pathlib.Path('/opt/win-ai/public/brand.svg')
updates[icon]=base64.b64decode(payload['icon'])
backup=pathlib.Path('/opt/xingzhou-backups')/('winai-ui-2869-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(parents=True,mode=0o700)
for p in updates:shutil.copy2(p,backup/p.name)
try:
 for p,data in updates.items():p.write_bytes(data)
 result=subprocess.run(['nginx','-t'],capture_output=True)
 if result.returncode:raise RuntimeError('nginx test failed')
 subprocess.run(['systemctl','reload','nginx'],check=True)
except Exception:
 for p in updates:shutil.copy2(backup/p.name,p)
 subprocess.run(['nginx','-t'],capture_output=True,check=True)
 subprocess.run(['systemctl','reload','nginx'],check=True)
 raise
print(json.dumps({'backup':str(backup),'files':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in updates}}))
'''
remote=remote.replace('PAYLOAD',repr(json.dumps({'icon':base64.b64encode(svg.encode()).decode()})))
result=subprocess.run(['ssh',*OPTIONS,'ubuntu@106.55.41.128','sudo python3 -'],input=remote,text=True,capture_output=True,timeout=45)
if result.returncode:raise SystemExit('UI deploy failed: '+result.stderr[-400:])
print(result.stdout)

