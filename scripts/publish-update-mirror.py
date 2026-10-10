"""Publish a verified signed release to the existing authenticated SSH host."""
import hashlib, json, os, pathlib, re, subprocess, sys, tempfile, uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
installer, manifest_file = map(pathlib.Path, sys.argv[1:3])
manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
version, digest, size = manifest['version'], manifest['sha256'], manifest['size']
if not re.fullmatch(r'\d+\.\d+\.\d+', version):
    raise SystemExit('Invalid mirror version')
if installer.name != f'Xingzhou-Film-Tencent-Setup-{version}.exe':
    raise SystemExit('Invalid mirror installer name')
with installer.open('rb') as stream:
    if installer.stat().st_size != size or hashlib.file_digest(stream, 'sha256').hexdigest() != digest:
        raise SystemExit('Mirror installer does not match signed manifest')
subprocess.run(['node', '-e', "require('./electron/update-trust.cjs').validateManifest(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')))", str(manifest_file.resolve())], cwd=ROOT, check=True)

key = pathlib.Path(os.environ.get('XINGZHOU_RELEASE_SSH_KEY', pathlib.Path.home()/'.ssh/xingzhou_tencent_test'))
known = pathlib.Path.home()/'.ssh/known_hosts_xingzhou'
host = 'ubuntu@106.55.41.128'
ssh_opts = ['-i', str(key), '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', f'UserKnownHostsFile={known}']
stage = f'/home/ubuntu/xingzhou-update-stage-v{version}-{uuid.uuid4().hex}'
subprocess.run(['ssh', *ssh_opts, host, f'mkdir -m 700 {stage}'], check=True)
with tempfile.TemporaryDirectory(prefix='xingzhou-mirror-') as scratch:
    # Git for Windows may check shell files out with CRLF. Upload LF explicitly.
    helper = pathlib.Path(scratch)/'install.sh'
    helper.write_bytes((ROOT/'scripts/install-update-mirror.sh').read_text(encoding='utf-8').replace('\r\n', '\n').encode('utf-8'))
    for local, remote in [(installer, installer.name), (manifest_file, 'latest.json'), (helper, 'install.sh')]:
        subprocess.run(['scp', *ssh_opts, str(local.resolve()), f'{host}:{stage}/{remote}'], check=True)
subprocess.run(['ssh', *ssh_opts, host, f'sudo bash {stage}/install.sh {stage} {version} {digest} {size}'], check=True)
print(f'OFFICIAL_MIRROR_PUBLISHED https://xingzhoufilm.cn/api/updates/{installer.name}')
