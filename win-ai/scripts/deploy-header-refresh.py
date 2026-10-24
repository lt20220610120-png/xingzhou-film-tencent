"""Deploy only account-routing.js; default is a local dry run. No nginx reload."""
import argparse
import base64
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASELINE_SHA256 = '2c990f5b3f8e5245292963c6b46ffd50e8053efd476e4529edd4398d5a6de925'
TARGET = '/opt/win-ai/public/account-routing.js'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Apply the verified incremental update over SSH')
    args = parser.parse_args()
    source = (ROOT / 'win-ai/public/account-routing.js').read_bytes()
    digest = hashlib.sha256(source).hexdigest()
    if not args.apply:
        print(json.dumps({'dryRun': True, 'target': TARGET, 'sha256': digest, 'expectedPreviousSha256': BASELINE_SHA256}))
        return
    payload = {'source': base64.b64encode(source).decode(), 'sha256': digest, 'previous': BASELINE_SHA256}
    remote = r'''
import base64,datetime,hashlib,json,os,pathlib,shutil,tempfile
payload=json.loads(PAYLOAD)
target=pathlib.Path('/opt/win-ai/public/account-routing.js')
data=base64.b64decode(payload['source'])
if hashlib.sha256(data).hexdigest()!=payload['sha256']:raise SystemExit('Payload digest mismatch')
old=hashlib.sha256(target.read_bytes()).hexdigest()
if old==payload['sha256']:
 print(json.dumps({'unchanged':True,'sha256':old}));raise SystemExit(0)
if old!=payload['previous']:raise SystemExit('Unexpected deployed source digest: '+old)
backup=pathlib.Path('/opt/xingzhou-backups')/('winai-header-refresh-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ'))
backup.mkdir(parents=True,mode=0o700)
shutil.copy2(target,backup/target.name)
fd,temporary=tempfile.mkstemp(prefix='.account-routing-',dir=target.parent)
try:
 with os.fdopen(fd,'wb') as handle:
  handle.write(data);handle.flush();os.fsync(handle.fileno())
 shutil.copystat(target,temporary)
 stat=target.stat();os.chown(temporary,stat.st_uid,stat.st_gid)
 os.replace(temporary,target)
 if hashlib.sha256(target.read_bytes()).hexdigest()!=payload['sha256']:raise RuntimeError('Deployed digest mismatch')
except Exception:
 shutil.copy2(backup/target.name,target)
 raise
finally:
 if os.path.exists(temporary):os.unlink(temporary)
print(json.dumps({'backup':str(backup),'target':str(target),'sha256':payload['sha256']}))
'''.replace('PAYLOAD', repr(json.dumps(payload)))
    options = ['-i', str(pathlib.Path.home() / '.ssh/xingzhou_tencent_test'), '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + str(pathlib.Path.home() / '.ssh/known_hosts_xingzhou')]
    result = subprocess.run(['ssh', *options, 'ubuntu@106.55.41.128', 'sudo python3 -'], input=remote, text=True, capture_output=True, timeout=45)
    if result.returncode:
        raise SystemExit('Header refresh deployment failed: ' + result.stderr[-500:])
    print(result.stdout.strip())


if __name__ == '__main__':
    main()
