"""Publish xingzhou-film release to GitHub: create release, upload installer, update latest.json."""
import base64, json, subprocess, urllib.request, urllib.error, os, sys, time, glob

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PACKAGE = json.load(open(os.path.join(ROOT, 'package.json'), encoding='utf-8'))
VERSION = sys.argv[1] if len(sys.argv) > 1 else PACKAGE['version']
NOTES = sys.argv[2] if len(sys.argv) > 2 else ''
if not NOTES:
    notes_file = os.path.join(ROOT, 'release-notes', f'{VERSION}.md')
    if os.path.exists(notes_file):
        NOTES = open(notes_file, encoding='utf-8').read().strip()
if not NOTES:
    NOTES = f'行舟影视 {VERSION} 更新。请在软件设置页检查更新。'

REPO = 'lt20220610120-png/xingzhou-film-updates'
MANIFEST_REPOS = [REPO, 'lt20220610120-png/xingzhou-film-tencent']
TAG = f'v{VERSION}'
RELEASE_DIR = os.path.join(ROOT, 'release', VERSION)
expected = [
    os.path.join(RELEASE_DIR, f'Xingzhou-Film-Tencent-Setup-{VERSION}.exe'),
    os.path.join(RELEASE_DIR, f'Xingzhou-Film-Setup-{VERSION}.exe'),
    os.path.join(ROOT, 'release', f'Xingzhou-Film-Tencent-Setup-{VERSION}.exe'),
    os.path.join(ROOT, 'release', f'Xingzhou-Film-Setup-{VERSION}.exe'),
]
expected += glob.glob(os.path.join(RELEASE_DIR, '*.exe'))
SRC = next((path for path in expected if os.path.isfile(path)), None)
if not SRC:
    raise SystemExit(f'找不到 {VERSION} 安装包，请先运行 npm run dist；已检查 {RELEASE_DIR}')
ASSET = os.path.basename(SRC)


def token():
    if os.environ.get('GITHUB_TOKEN'):
        return os.environ['GITHUB_TOKEN']
    cred = subprocess.check_output(['git', 'credential', 'fill'], input=b'protocol=https\nhost=github.com\n\n').decode()
    return next(x.split('=', 1)[1] for x in cred.split('\n') if x.startswith('password='))


TOKEN = token()


def req(url, method='GET', data=None, content_type=None):
    headers = {'Authorization': f'Bearer {TOKEN}', 'Accept': 'application/vnd.github+json'}
    if content_type:
        headers['Content-Type'] = content_type
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=600)
        return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except urllib.error.URLError:
        raise


# 1) Create release (or reuse existing one with same tag — makes the script safely re-runnable)
st, b = req(f'https://api.github.com/repos/{REPO}/releases/tags/{TAG}')
if st == 200:
    rid = json.loads(b)['id']
    print(f'release exists id={rid}, reusing')
else:
    st, b = req(f'https://api.github.com/repos/{REPO}/releases', 'POST',
                json.dumps({'tag_name': TAG, 'target_commitish': 'main', 'name': f'行舟影视 {VERSION}',
                            'body': NOTES, 'draft': False, 'prerelease': False}).encode(),
                'application/json')
    assert st in (200, 201), f'Release create failed: {st} {b[:300]}'
    rid = json.loads(b)['id']
    print(f'release created id={rid}')

# 2) Upload asset (delete stale/partial asset with same name first; retry on network hiccups)
st, b = req(f'https://api.github.com/repos/{REPO}/releases/{rid}/assets')
if st == 200:
    for asset in json.loads(b):
        if asset['name'] != ASSET:
            req(f'https://api.github.com/repos/{REPO}/releases/assets/{asset["id"]}', 'DELETE')
            print(f'removed stale asset {asset["id"]}: {asset["name"]}')
size = os.path.getsize(SRC)
print(f'uploading {size} bytes...')
last_error = None
for attempt in range(3):
    try:
        with open(SRC, 'rb') as f:
            st, b = req(f'https://uploads.github.com/repos/{REPO}/releases/{rid}/assets?name={ASSET}', 'POST', f.read(),
                        'application/octet-stream')
        if st == 201:
            break
        last_error = f'{st} {b[:300]}'
    except Exception as exc:  # network reset mid-upload leaves a partial asset — delete and retry
        last_error = str(exc)
    print(f'upload attempt {attempt + 1} failed: {last_error}; retrying...')
    st2, b2 = req(f'https://api.github.com/repos/{REPO}/releases/{rid}/assets')
    if st2 == 200:
        for asset in json.loads(b2):
            if asset['name'] == ASSET:
                req(f'https://api.github.com/repos/{REPO}/releases/assets/{asset["id"]}', 'DELETE')
else:
    sys.exit(f'Upload failed after retries: {last_error}')
assert st == 201, f'Upload failed: {st} {b[:300]}'
dl = json.loads(b)['browser_download_url']
print('uploaded:', dl)

# 3) Update latest.json on both the dedicated update repo and the source repo.
# Older clients read the source repo; the dedicated repo is the canonical release
# location. Keeping both in sync makes every published release discoverable.
manifest = {'version': VERSION,
            'installerUrl': f'https://github.com/{REPO}/releases/download/{TAG}/{ASSET}',
            'notes': NOTES,
            'sha256': __import__('hashlib').sha256(open(SRC, 'rb').read()).hexdigest(),
            'size': size}
manifest_text = json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'
for manifest_repo in MANIFEST_REPOS:
    st, b = req(f'https://api.github.com/repos/{manifest_repo}/contents/latest.json')
    assert st == 200, f'get latest.json failed for {manifest_repo}: {st}'
    current = json.loads(base64.b64decode(json.loads(b)['content']).decode('utf-8'))
    if current == manifest:
        print(f'latest.json already current in {manifest_repo}')
        continue
    sha = json.loads(b)['sha']
    body = json.dumps({'message': f'release {TAG}',
                       'content': base64.b64encode(manifest_text.encode()).decode(),
                       'sha': sha}).encode()
    st, b = req(f'https://api.github.com/repos/{manifest_repo}/contents/latest.json', 'PUT', body, 'application/json')
    assert st in (200, 201), f'latest.json update failed for {manifest_repo}: {st} {b[:300]}'
    print(f'latest.json updated in {manifest_repo}')
print(json.dumps({'release': f'https://github.com/{REPO}/releases/tag/{TAG}', 'asset': dl, 'size': size}, ensure_ascii=False))
