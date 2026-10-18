"""Public upgrade/source archive. Does not read /etc credentials or DPAPI caches."""
import hashlib
import json
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
WIN = ROOT/'win-ai'
version = json.loads((WIN/'upstream.json').read_text(encoding='utf-8'))['version']
out = ROOT/'release/win-ai'/version/('Win-AI-'+version+'.zip')
out.parent.mkdir(parents=True, exist_ok=True)
bridge = ['server.cjs', 'postgres-repository.cjs', 'win-ai-identity.cjs', 'win-ai-repository.cjs', 'win-ai-sqlite.py', 'win-ai-lookup.cjs', 'win-ai-payment.cjs', 'win-ai-web-auth.cjs']
old = ROOT/'release/win-ai/0.1.0/Win-AI-0.1.0.zip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as bundle:
    for path in WIN.rglob('*'):
        if not path.is_file() or '__pycache__' in path.parts or path.suffix == '.pyc' or path.name.endswith('.dpapi.xml') or path.name in {'renew-server-once.py', 'server-renewal-quote.py'}:
            continue
        bundle.writestr('win-ai/'+path.relative_to(WIN).as_posix(), path.read_bytes().replace(b'\r\n', b'\n'))
    for name in bridge:
        path = ROOT/'cloud-backend/src'/name
        bundle.writestr('cloud-backend/src/'+name, path.read_bytes().replace(b'\r\n', b'\n'))
    path = ROOT/'cloud-backend/migrations/20261018_win_ai_identity.sql'
    bundle.writestr('cloud-backend/migrations/'+path.name, path.read_bytes().replace(b'\r\n', b'\n'))
    with zipfile.ZipFile(old) as base:
        for name in base.namelist():
            if name.startswith('source/') or name == 'new-api-v1.0.0-rc.45':
                bundle.writestr('win-ai/'+name, base.read(name))
    bundle.writestr('UPGRADE.md', '''# Win AI 0.2.0 upgrade

For the already-authorized Xingzhou Tencent host with its existing cloud backend and Win AI 0.1 gateway.

From this extracted folder run: python win-ai/scripts/deploy-identity.py

The script uses the owner's existing SSH identity and known_hosts, runs an isolated PostgreSQL migration test, backs up service/proxy/public files, applies only additive identity tables, installs the bridge and static pages, and configures native OAuth/wallet UI. Existing provider credentials and balances are not copied from the reference website. Pricing presets are seeded once and operator changes are preserved on reruns.

Do not run the archived 0.1 deploy.py/install.sh/publish-site.sh against an upgraded installation. This upgrade is not a generic fresh-server installer. Native binary/source and licenses are retained under win-ai/. No merchant keys, user credentials, SSH keys or DPAPI cache are included.

Read win-ai/README.md, docs/unified-login.md and docs/payment-setup.md. Real payments still require the operator's own merchant credentials, truthful business information, owner confirmation and small-payment verification. Public external connectivity remains separately qualified.
'''.replace('0.2.0', version))
metadata = {'version': version, 'path': str(out.resolve()), 'url': 'https://winai.xingzhoufilm.cn/downloads/'+out.name, 'size': out.stat().st_size, 'sha256': hashlib.file_digest(out.open('rb'), 'sha256').hexdigest()}
(ROOT/('output/win-ai-release-'+version+'.json')).write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(metadata, ensure_ascii=False))
