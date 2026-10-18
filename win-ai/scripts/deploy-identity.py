"""Stage the additive identity bridge to the already authorized Tencent host."""
import pathlib
import subprocess
import tempfile
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
HOST = 'ubuntu@106.55.41.128'
STAGE = '/home/ubuntu/xingzhou-winai-v2846-stage'
OPTIONS = ['-i', str(pathlib.Path.home()/'.ssh/xingzhou_tencent_test'), '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile='+str(pathlib.Path.home()/'.ssh/known_hosts_xingzhou')]
FILES = ['cloud-backend/src/server.cjs', 'cloud-backend/src/postgres-repository.cjs',
         'cloud-backend/src/win-ai-identity.cjs', 'cloud-backend/src/win-ai-repository.cjs',
         'cloud-backend/src/win-ai-sqlite.py', 'cloud-backend/src/win-ai-lookup.cjs', 'cloud-backend/src/win-ai-payment.cjs',
         'cloud-backend/migrations/20261018_win_ai_identity.sql', 'win-ai/nginx.conf', 'win-ai/ip-https.conf',
         'win-ai/test/postgres-identity.cjs', 'win-ai/scripts/install-identity.sh',
         'win-ai/scripts/configure-identity.py']
FILES += [p.relative_to(ROOT).as_posix() for p in (ROOT/'win-ai/public').iterdir() if p.is_file() and p.suffix in {'.html', '.css', '.js', '.svg'}]
with tempfile.TemporaryDirectory(prefix='xingzhou-winai-') as folder:
    archive = pathlib.Path(folder)/'identity.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for name in FILES:
            bundle.writestr(name, (ROOT/name).read_bytes().replace(b'\r\n', b'\n'))
    subprocess.run(['scp', *OPTIONS, str(archive), HOST+':'+STAGE+'.zip'], check=True)
    subprocess.run(['ssh', *OPTIONS, HOST, "python3 -c \"import zipfile;zipfile.ZipFile('"+STAGE+".zip').extractall('"+STAGE+"')\" && sudo bash "+STAGE+'/win-ai/scripts/install-identity.sh '+STAGE], check=True)
