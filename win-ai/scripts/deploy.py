"""Deploy to the already authorized Xingzhou host, using strict known-host verification."""
import pathlib
import hashlib
import json
import subprocess
import tempfile
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
HOST = 'ubuntu@106.55.41.128'
STAGE = '/home/ubuntu/win-ai-stage-0.1.0'
opts = ['-i',str(pathlib.Path.home()/'.ssh/xingzhou_tencent_test'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(pathlib.Path.home()/'.ssh/known_hosts_xingzhou')]
with tempfile.TemporaryDirectory(prefix='win-ai-deploy-') as folder:
    archive = pathlib.Path(folder)/'stage.zip'
    metadata = json.loads((ROOT/'upstream.json').read_text(encoding='utf-8'))
    cache = ROOT.parent/'output'/'win-ai-research'
    binary = ROOT/metadata['binary']
    if not binary.exists():
        binary = cache/metadata['binary']
    if not binary.exists():
        binary = pathlib.Path(folder)/metadata['binary']
        urllib.request.urlretrieve(metadata['upstream']+'/releases/download/'+metadata['upstreamVersion']+'/'+metadata['binary'], binary)
    assert hashlib.file_digest(binary.open('rb'),'sha256').hexdigest() == metadata['binarySha256'], 'Official binary checksum mismatch'
    source = ROOT/'source'/('new-api-'+metadata['upstreamVersion']+'.zip')
    if not source.exists():
        source = cache/('new-api-'+metadata['upstreamVersion']+'.zip')
    if not source.exists():
        source = pathlib.Path(folder)/('new-api-'+metadata['upstreamVersion']+'.zip')
        urllib.request.urlretrieve(metadata['sourceUrl'], source)
    assert hashlib.file_digest(source.open('rb'),'sha256').hexdigest() == metadata['sourceSha256'], 'Official source checksum mismatch'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in ROOT.rglob('*'):
            if not p.is_file() or '__pycache__' in p.parts or p.name.endswith(('.pyc','.dpapi.xml')):
                continue
            data = p.read_bytes()
            if p.suffix in {'.sh','.py','.html','.js','.css','.md','.conf','.service','.svg','.ps1'}:
                data = data.replace(b'\r\n', b'\n')
            z.writestr(p.relative_to(ROOT).as_posix(), data)
        if metadata['binary'] not in z.namelist():
            z.write(binary, metadata['binary'])
        source_name = 'source/new-api-'+metadata['upstreamVersion']+'.zip'
        if source_name not in z.namelist():
            z.write(source, source_name)
        with zipfile.ZipFile(source) as original:
            prefix = original.namelist()[0]
            for name in ['LICENSE','NOTICE','THIRD-PARTY-LICENSES.md']:
                if 'source/'+name not in z.namelist():
                    z.writestr('source/'+name, original.read(prefix+name))
    subprocess.run(['scp','-C',*opts,str(archive),HOST+':'+STAGE+'.zip'],check=True)
    cmd = 'python3 -c "import zipfile;zipfile.ZipFile(\''+STAGE+'.zip\').extractall(\''+STAGE+'\')" && sudo bash '+STAGE+'/scripts/install.sh '+STAGE+' && sudo bash '+STAGE+'/scripts/publish-site.sh '+STAGE
    subprocess.run(['ssh',*opts,HOST,cmd],check=True)
