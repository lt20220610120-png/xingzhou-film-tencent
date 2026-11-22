"""Publish one verified Windows artifact and reconcile the signed update channels."""
import argparse
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

from release_assets import ensure_release_asset
from release_policy import check_release_order, version_tuple

ROOT=Path(__file__).resolve().parents[1]
REPO='lt20220610120-png/xingzhou-film-updates'
MANIFEST_REPOS=(REPO,'lt20220610120-png/xingzhou-film-tencent')
API='https://api.github.com'
OFFICIAL='https://xingzhoufilm.cn/api/updates/latest.json'


def require_status(status, expected, operation):
    if status not in expected:
        raise RuntimeError(f'{operation} 失败（HTTP {status}）')


def curl_request(url, headers, method='GET', data=None, *, timeout=30):
    # Use stdin for authorization headers so the token never appears in arguments.
    config='\n'.join('header = '+json.dumps(f'{name}: {value}') for name,value in headers.items())+'\n'
    with tempfile.TemporaryDirectory(prefix='xingzhou-publish-http-') as scratch:
        directory=Path(scratch)
        target=directory/'response'
        command=['curl.exe' if os.name=='nt' else 'curl','--http1.1','--silent','--show-error',
                 '--connect-timeout','10','--max-time',str(timeout),'--config','-','--request',method,
                 '--output',str(target),'--write-out','%{http_code}',url]
        if method=='GET':
            command+=['--retry','2','--retry-all-errors','--retry-delay','1']
        if data is not None:
            payload=directory/'request'
            payload.write_bytes(data)
            command+=['--data-binary','@'+str(payload)]
        run=subprocess.run(command,input=config.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if run.returncode or not run.stdout.isdigit():
            raise OSError(f'{method} {urllib.parse.urlsplit(url).hostname} 连接未确认')
        return int(run.stdout),target.read_bytes()


def github_request():
    token=os.environ.get('GITHUB_TOKEN')
    if not token:
        credential=subprocess.check_output(['git','credential','fill'],input=b'protocol=https\nhost=github.com\n\n').decode()
        token=next(item[9:] for item in credential.splitlines() if item.startswith('password='))
    def request(url, method='GET', data=None, content_type=None):
        headers={'Authorization':f'Bearer {token}','Accept':'application/vnd.github+json'}
        if content_type:
            headers['Content-Type']=content_type
        if os.name=='nt' and not url.startswith('https://uploads.github.com/'):
            return curl_request(url,headers,method,data)
        req=urllib.request.Request(url,data=data,headers=headers,method=method)
        try:
            with urllib.request.urlopen(req,timeout=120 if url.startswith('https://uploads.github.com/') else 25) as response:
                return response.status,response.read()
        except urllib.error.HTTPError as error:
            return error.code,error.read()
    return request


def official_manifest():
    req=urllib.request.Request(OFFICIAL,headers={'Cache-Control':'no-cache'})
    if os.name=='nt':
        status,data=curl_request(OFFICIAL,req.headers)
        require_status(status,{200},'读取官网更新清单')
        return json.loads(data)
    with urllib.request.urlopen(req,timeout=20) as response:
        return json.load(response)


def read_repo_manifest(request, repo):
    status, data=request(f'{API}/repos/{repo}/contents/latest.json')
    require_status(status,{200},f'读取 {repo} 更新清单')
    doc=json.loads(data)
    return json.loads(base64.b64decode(doc['content'])),doc['sha']


def verify_manifests(channels):
    subprocess.run(['node','-e',"""
const fs=require('node:fs');
const {validateManifest}=require('./electron/update-trust.cjs');
for(const value of Object.values(JSON.parse(fs.readFileSync(0,'utf8'))))validateManifest(value);
"""],cwd=ROOT,input=json.dumps(channels).encode(),check=True)


def find_release(request, version):
    tag=f'v{version}'
    status,data=request(f'{API}/repos/{REPO}/releases/tags/{tag}')
    if status==200:
        return json.loads(data)
    require_status(status,{404},f'读取发布 {tag}')
    # GitHub's tag endpoint may hide drafts until publication.
    for page in range(1,4):
        status,data=request(f'{API}/repos/{REPO}/releases?per_page=40&page={page}')
        require_status(status,{200},'核对 GitHub 草稿')
        items=json.loads(data)
        for release in items:
            if release['tag_name']==tag:
                return release
        if len(items)<40:
            break
    return None


def check_latest_public_release(request, version, *, resume=False, rollback=False):
    status,body=request(f'{API}/repos/{REPO}/releases/latest')
    require_status(status,{200},'核对 GitHub 最新公开发布')
    latest=json.loads(body)['tag_name'].removeprefix('v')
    if version_tuple(version)<version_tuple(latest) and not rollback:
        raise ValueError(f'GitHub 最新公开发布为 {latest}，回滚须使用 --allow-rollback')
    if version_tuple(version)==version_tuple(latest) and not (resume or rollback):
        raise ValueError(f'GitHub 已公开 {latest}，续发须使用 --resume')


def stage_release(request, version, notes):
    found=find_release(request,version)
    if found:
        return found
    payload={'tag_name':f'v{version}','target_commitish':'main','name':f'行舟影视 {version}',
             'body':notes,'draft':True,'prerelease':False}
    try:
        status,data=request(f'{API}/repos/{REPO}/releases','POST',json.dumps(payload).encode(),'application/json')
        require_status(status,{201},'创建 GitHub 发布草稿')
    except (OSError,RuntimeError):
        saved=find_release(request,version)
        if saved:
            return saved
        raise
    return json.loads(data)


def signed_manifest(version, name, notes, digest, size, existing):
    if existing:
        if any(item!=existing[0] for item in existing):
            raise RuntimeError('同版本已上线的签名清单不一致，请查明差异再续发')
        return existing[0]
    value={'version':version,'installerUrl':f'https://github.com/{REPO}/releases/download/v{version}/{name}',
           'notes':notes,'sha256':digest,'size':size,'publishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    with tempfile.TemporaryDirectory(prefix='xingzhou-release-sign-') as temporary:
        file=Path(temporary)/'latest.json'
        file.write_text(json.dumps(value,ensure_ascii=False),encoding='utf-8')
        subprocess.run(['node',str(ROOT/'scripts/sign-update.cjs'),str(file)],check=True)
        return json.loads(file.read_text(encoding='utf-8'))


def update_repo(request, repo, manifest, body, *, resume, rollback):
    current, sha=read_repo_manifest(request,repo)
    if current==manifest:
        return
    check_release_order(manifest['version'],manifest['sha256'],manifest['size'],{repo:current},resume=resume,rollback=rollback)
    payload={'message':f"release v{manifest['version']}",'sha':sha,'content':base64.b64encode(body).decode()}
    try:
        status,_=request(f'{API}/repos/{repo}/contents/latest.json','PUT',json.dumps(payload).encode(),'application/json')
        require_status(status,{200,201},f'更新 {repo} 清单')
    except (OSError,RuntimeError):
        # The server may have committed even when the client lost the response.
        if read_repo_manifest(request,repo)[0]!=manifest:
            raise


def report_channels(request):
    for name, read in [('官网',official_manifest),*((repo,lambda repo=repo:read_repo_manifest(request,repo)[0]) for repo in MANIFEST_REPOS)]:
        try:
            print(f"{name} 当前 {read()['version']}",file=sys.stderr)
        except Exception:
            print(f'{name} 当前状态无法核对',file=sys.stderr)


def read_release_notes(root, version, *, recovery=False):
    version_tuple(version)
    filename=f'{version}.md'
    notes_file=root/'release-notes'/filename
    if recovery and not notes_file.is_file():
        notes_file=root/'docs'/'archive'/'release-notes'/filename
    return notes_file.read_text(encoding='utf-8-sig').strip() if notes_file.is_file() else f'行舟影视 {version} 更新。'


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('version',nargs='?',default=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version'])
    parser.add_argument('notes',nargs='?')
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument('--resume',action='store_true',help='续发同一份已核验安装包')
    mode.add_argument('--allow-rollback',action='store_true',help='明确允许三个更新渠道回到该已验证版本')
    parser.add_argument('--prepare-upload',action='store_true',help='只建 GitHub 草稿，供校验后的上传流程使用')
    parser.add_argument('--use-staged-mirror',action='store_true',help='使用服务器上已校验的同版本安装包')
    args=parser.parse_args()
    version=args.version
    version_tuple(version)
    name=f'Xingzhou-Film-Tencent-Setup-{version}.exe'
    directory=ROOT/'release'/version
    directory.mkdir(parents=True,exist_ok=True)
    source=next((candidate for candidate in (directory/name,ROOT/'release'/name) if candidate.is_file()),None)
    if not source:
        raise SystemExit(f'找不到 {version} 安装包，请先运行 npm run dist')
    notes=args.notes or read_release_notes(ROOT,version,recovery=args.resume or args.allow_rollback)
    with source.open('rb') as stream:
        digest=hashlib.file_digest(stream,'sha256').hexdigest()
    size=source.stat().st_size
    request=github_request()
    order={'resume':args.resume,'rollback':args.allow_rollback}
    try:
        channels={'官网':official_manifest(),**{repo:read_repo_manifest(request,repo)[0] for repo in MANIFEST_REPOS}}
        verify_manifests(channels)
        check_release_order(version,digest,size,channels,**order)
        check_latest_public_release(request,version,**order)
        release=stage_release(request,version,notes)
        release_id=release['id']
        if args.prepare_upload:
            print(json.dumps({'releaseId':release_id,'version':version,'sha256':digest,'size':size}))
            return
        ensure_release_asset(request,REPO,release_id,source,name,size,digest)
        if release.get('draft') or args.allow_rollback:
            url=f'{API}/repos/{REPO}/releases/{release_id}'
            try:
                status,_=request(url,'PATCH',b'{"draft":false,"prerelease":false,"make_latest":"true"}','application/json')
                require_status(status,{200},'公开 GitHub 正式发布')
            except (OSError,RuntimeError):
                status,result=request(url)
                saved=json.loads(result) if status==200 else {}
                if saved.get('draft',True) or saved.get('prerelease',True):
                    raise
        # Reuse the exact signed bytes on explicitly resumed partial publication.
        manifest=signed_manifest(version,name,notes,digest,size,[item for item in channels.values() if item['version']==version])
        content=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
        local_manifest=directory/'latest.json'
        local_manifest.write_bytes(content)
        mirror=[sys.executable,str(ROOT/'scripts/publish-update-mirror.py'),str(source),str(local_manifest)]
        if args.resume:
            mirror.append('--resume')
        if args.allow_rollback:
            mirror.append('--allow-rollback')
        if args.use_staged_mirror:
            mirror.append('--use-staged-mirror')
        subprocess.run(mirror,check=True)
        for repo in MANIFEST_REPOS:
            update_repo(request,repo,manifest,content,**order)
        (ROOT/'latest.json').write_bytes(content)
        subprocess.run(['node',str(ROOT/'scripts/release-retention.cjs')],check=True)
        print(json.dumps({'releaseId':release_id,'asset':manifest['installerUrl'],'size':size}))
    except Exception:
        report_channels(request)
        raise


if __name__=='__main__':
    main()
