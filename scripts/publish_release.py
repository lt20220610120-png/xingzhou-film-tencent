"""Publish xingzhou-film release to GitHub: create release, upload installer, update latest.json."""
import base64, json, subprocess, urllib.request, urllib.error, os, sys

VERSION = sys.argv[1] if len(sys.argv) > 1 else None
NOTES = sys.argv[2] if len(sys.argv) > 2 else ''
if not VERSION:
    print('usage: python publish_release.py <version> <notes>')
    sys.exit(1)

REPO = 'lt20220610120-png/xingzhou-film-updates'
TAG = f'v{VERSION}'
SRC = f'C:/Users/11599/AppData/Local/Temp/xingzhou-release-v{VERSION.replace(".", "")}/行舟影视-安装程序-{VERSION}.exe'
ASSET = f'Xingzhou-Film-Setup-{VERSION}.exe'


def token():
    cred = subprocess.check_output(['git', 'credential', 'fill'], input=b'protocol=https\nhost=github.com\n\n').decode()
    return next(x.split('=', 1)[1] for x in cred.split('\n') if x.startswith('password='))


TOKEN = token()


def req(url, method='GET', data=None, content_type=None):
    headers = {'Authorization': f'Bearer {TOKEN}', 'Accept': 'application/vnd.github+json'}
    if content_type:
        headers['Content-Type'] = content_type
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(r)
        return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


# 1) Create release
st, b = req(f'https://api.github.com/repos/{REPO}/releases', 'POST',
            json.dumps({'tag_name': TAG, 'target_commitish': 'main', 'name': f'行舟影视 {VERSION}',
                        'body': NOTES, 'draft': False, 'prerelease': False}).encode(),
            'application/json')
assert st in (200, 201), f'Release create failed: {st} {b[:300]}'
rid = json.loads(b)['id']
print(f'release created id={rid}')

# 2) Upload asset
size = os.path.getsize(SRC)
print(f'uploading {size} bytes...')
with open(SRC, 'rb') as f:
    st, b = req(f'https://uploads.github.com/repos/{REPO}/releases/{rid}/assets?name={ASSET}', 'POST', f.read(),
                'application/octet-stream')
assert st == 201, f'Upload failed: {st} {b[:300]}'
dl = json.loads(b)['browser_download_url']
print('uploaded:', dl)

# 3) Update latest.json on main
manifest = {'version': VERSION,
            'installerUrl': f'https://github.com/{REPO}/releases/download/{TAG}/{ASSET}',
            'notes': NOTES}
st, b = req(f'https://api.github.com/repos/{REPO}/contents/latest.json')
assert st == 200, f'get latest.json failed: {st}'
sha = json.loads(b)['sha']
body = json.dumps({'message': f'release {TAG}',
                   'content': base64.b64encode(json.dumps(manifest, ensure_ascii=False, indent=2).encode()).decode(),
                   'sha': sha}).encode()
st, b = req(f'https://api.github.com/repos/{REPO}/contents/latest.json', 'PUT', body, 'application/json')
assert st in (200, 201), f'latest.json update failed: {st} {b[:300]}'
print('latest.json updated')
print(json.dumps({'release': f'https://github.com/{REPO}/releases/tag/{TAG}', 'asset': dl, 'size': size}, ensure_ascii=False))
