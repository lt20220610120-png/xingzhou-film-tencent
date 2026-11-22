"""Install a verified immutable Windows build and bound mirror storage."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import time

from release_policy import check_release_order, version_tuple

ROOT=Path('/opt/xingzhou-updates')
STAGES=Path('/home/ubuntu')
STAGE=re.compile(r'xingzhou-update-stage-v([0-9]+\.[0-9]+\.[0-9]+)-[a-f0-9]{32}')
ASSET=re.compile(r'Xingzhou-Film-Tencent-Setup-((?:0|[1-9][0-9]{0,8})(?:\.(?:0|[1-9][0-9]{0,8})){2})\.exe')
UPLOAD=re.compile(r'(?:latest\.json|Xingzhou-Film-Tencent-Setup-[0-9]+\.[0-9]+\.[0-9]+\.exe)\.upload(?:-[a-z0-9_]{8})?')
REPO='lt20220610120-png/xingzhou-film-updates'


def installer_name(version):
    return f'Xingzhou-Film-Tencent-Setup-{version}.exe'


def validate_stage(stage):
    if stage.parent!=STAGES or not STAGE.fullmatch(stage.name) or stage.resolve()!=stage or not stage.is_dir():
        raise ValueError('镜像暂存路径无效')
    return STAGE.fullmatch(stage.name)[1]


def cleanup_stage(stage, version):
    # Known stage files are unlinked individually. A symlink is never followed.
    for name in [installer_name(version),'latest.json','install.sh','mirror_install.py','release_policy.py','update-trust.cjs','update-signing-key.json']:
        (stage/name).unlink(missing_ok=True)
    try:
        stage.rmdir()
    except OSError:
        if stage.exists():
            print(f'暂存目录含其他内容，已保留 {stage}',file=sys.stderr)


def cleanup_stale_stages(parent, *, now=time.time, days=2):
    for stage in parent.iterdir():
        match=STAGE.fullmatch(stage.name)
        if not match or stage.is_symlink() or not stage.is_dir():
            continue
        newest=max([stage.stat().st_mtime,*[f.stat(follow_symlinks=False).st_mtime for f in stage.iterdir()]])
        age=now()-newest
        if age>days*86400:
            cleanup_stage(stage,match[1])


def retain_installers(root, active, *, keep=5):
    rows=[(version_tuple(match[1]),entry) for entry in root.iterdir()
          if (match:=ASSET.fullmatch(entry.name)) and entry.is_file() and not entry.is_symlink()]
    latest={entry.name for _,entry in sorted(rows,reverse=True)[:keep]}
    latest.add(installer_name(active))
    count=freed=0
    for _,entry in rows:
        if entry.name not in latest:
            size=entry.stat().st_size
            entry.unlink()
            count+=1
            freed+=size
    return count,freed


def cleanup_interrupted_uploads(root, *, now=time.time):
    for entry in root.iterdir():
        if (UPLOAD.fullmatch(entry.name) and entry.is_file() and not entry.is_symlink()
            and now()-entry.stat().st_mtime>2*86400):
            entry.unlink()


def sha256(file):
    with file.open('rb') as handle:
        return hashlib.file_digest(handle,'sha256').hexdigest()


def atomic_file(target, source):
    fd,name=tempfile.mkstemp(dir=target.parent,prefix=target.name+'.upload-')
    temporary=Path(name)
    try:
        with os.fdopen(fd,'wb') as stream, source.open('rb') as incoming:
            shutil.copyfileobj(incoming,stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary,0o644)
        os.replace(temporary,target)
    finally:
        temporary.unlink(missing_ok=True)


def install(root, stage, version, digest, size, *, resume=False, rollback=False):
    version_tuple(version)
    if not re.fullmatch(r'[0-9a-f]{64}',digest) or not 64<=size<=512*1024**2:
        raise ValueError('镜像安装包校验信息无效')
    name=installer_name(version)
    source,new_manifest=stage/name,stage/'latest.json'
    for item in [source,new_manifest]:
        if item.is_symlink() or not item.is_file():
            raise ValueError('镜像暂存文件无效')
    manifest=json.loads(new_manifest.read_text(encoding='utf-8'))
    expected=f'https://github.com/{REPO}/releases/download/v{version}/{name}'
    if (manifest['version'],manifest['sha256'],manifest['size'],manifest['installerUrl'])!=(version,digest,size,expected):
        raise ValueError('签名清单与安装包元信息不同')
    with source.open('rb') as stream:
        if stream.read(2)!=b'MZ' or source.stat().st_size!=size:
            raise ValueError('不是完整的 Windows 安装包')
    if sha256(source)!=digest:
        raise ValueError('安装包 SHA256 不匹配')
    published=root/'latest.json'
    if published.exists():
        if published.is_symlink():
            raise ValueError('已有镜像清单路径无效')
        current=json.loads(published.read_text(encoding='utf-8'))
        check_release_order(version,digest,size,{'官网':current},resume=resume,rollback=rollback)
        if current['version']==version and current!=manifest:
            raise ValueError('同版本镜像必须使用已签名的原清单')
    target=root/name
    if target.exists():
        if target.is_symlink() or sha256(target)!=digest:
            raise ValueError('该镜像版本已有不同的安装包')
    else:
        if shutil.disk_usage(root).free<size+512*1024**2:
            raise OSError('镜像剩余磁盘空间不足，现有更新清单保持原样')
        atomic_file(target,source)
    atomic_file(published,new_manifest)
    return retain_installers(root,version)


def main():
    import fcntl
    import subprocess
    stage=Path(sys.argv[1])
    version=validate_stage(stage)
    try:
        if version!=sys.argv[2]:
            raise ValueError('暂存版本不一致')
        ROOT.mkdir(parents=True,exist_ok=True)
        if ROOT.resolve()!=ROOT:
            raise ValueError('官网镜像目录不可重定向')
        with (ROOT/'.publish.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            cleanup_stale_stages(STAGES)
            cleanup_interrupted_uploads(ROOT)
            subprocess.run(['node','-e',
                "require(process.argv[1]).validateManifest(JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8')))",
                str(stage/'update-trust.cjs'),str(stage/'latest.json')],check=True)
            count,freed=install(ROOT,stage,version,sys.argv[3],int(sys.argv[4]),
                                resume='--resume' in sys.argv[5:],rollback='--allow-rollback' in sys.argv[5:])
            print(f'UPDATE_MIRROR_VERIFIED version={version} size={sys.argv[4]} sha256={sys.argv[3]} pruned={count} reclaimed={freed}')
    finally:
        cleanup_stage(stage,version)


if __name__=='__main__':
    main()
