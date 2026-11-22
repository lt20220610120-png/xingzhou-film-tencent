"""Upload a verified Windows artifact to the existing authenticated mirror."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import uuid

from release_policy import version_tuple

ROOT=Path(__file__).resolve().parents[1]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('installer',type=Path)
    parser.add_argument('manifest',type=Path)
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument('--resume',action='store_true')
    mode.add_argument('--allow-rollback',action='store_true')
    parser.add_argument('--use-staged-mirror',action='store_true')
    args=parser.parse_args()
    manifest=json.loads(args.manifest.read_text(encoding='utf-8'))
    version,digest,size=manifest['version'],manifest['sha256'],manifest['size']
    version_tuple(version)
    name=f'Xingzhou-Film-Tencent-Setup-{version}.exe'
    with args.installer.open('rb') as stream:
        if args.installer.name!=name or args.installer.stat().st_size!=size or hashlib.file_digest(stream,'sha256').hexdigest()!=digest:
            raise ValueError('镜像安装包与签名清单不同')
    subprocess.run(['node','-e',"require('./electron/update-trust.cjs').validateManifest(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')))",
                    str(args.manifest.resolve())],cwd=ROOT,check=True)
    key=Path(os.environ.get('XINGZHOU_RELEASE_SSH_KEY',Path.home()/'.ssh/xingzhou_tencent_test'))
    known=Path.home()/'.ssh/known_hosts_xingzhou'
    host='ubuntu@106.55.41.128'
    opts=['-i',str(key),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o',f'UserKnownHostsFile={known}','-o','ConnectTimeout=12']
    stage=f'/home/ubuntu/xingzhou-update-stage-v{version}-{uuid.uuid4().hex}'
    def ssh(tokens,**options):
        return subprocess.run(['ssh',*opts,host,shlex.join(tokens)],**options)
    names=[name,'latest.json','install.sh','mirror_install.py','release_policy.py','update-trust.cjs','update-signing-key.json']
    files=[(args.manifest,'latest.json'),(ROOT/'scripts/mirror_install.py','mirror_install.py'),
           (ROOT/'scripts/release_policy.py','release_policy.py'),(ROOT/'electron/update-trust.cjs','update-trust.cjs'),
           (ROOT/'electron/update-signing-key.json','update-signing-key.json')]
    created=False
    try:
        ssh(['mkdir','-m','700','--',stage],check=True)
        created=True
        if args.use_staged_mirror:
            # The reconstructed verified artifact belongs to this run once claimed.
            ssh(['bash','-c','test -f "$1" && test ! -L "$1" && mv -- "$1" "$2"','claim',
                 f'/home/ubuntu/xingzhou-{version}-verified.exe',f'{stage}/{name}'],check=True)
        else:
            files.append((args.installer,name))
        with tempfile.TemporaryDirectory(prefix='xingzhou-mirror-') as scratch:
            helper=Path(scratch)/'install.sh'
            helper.write_bytes((ROOT/'scripts/install-update-mirror.sh').read_text(encoding='utf-8-sig').replace('\r\n','\n').encode())
            files.append((helper,'install.sh'))
            for local, remote in files:
                subprocess.run(['scp',*opts,str(local.resolve()),f'{host}:{stage}/{remote}'],check=True)
        mode=['--resume'] if args.resume else ['--allow-rollback'] if args.allow_rollback else []
        ssh(['sudo','bash',f'{stage}/install.sh',stage,version,digest,str(size),*mode],check=True)
    finally:
        # Also runs on upload/transport errors before the server installer starts.
        if created:
            paths=[f'{stage}/{remote}' for remote in names]
            status=ssh(['rm','-f','--',*paths],check=False).returncode
            cleanup=ssh(['bash','-c','if test -d "$1"; then rmdir -- "$1"; fi','cleanup',stage],check=False).returncode
            if status or cleanup:
                print(f'镜像暂存清理未确认：{stage}',file=sys.stderr)


if __name__=='__main__':
    main()
