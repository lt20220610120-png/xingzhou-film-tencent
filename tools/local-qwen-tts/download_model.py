import concurrent.futures
import hashlib
import json
from pathlib import Path
import time
import urllib.request
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
MODEL = 'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign'
DEST = ROOT / 'models' / MODEL.split('/')[-1]

def download(item):
    rel = item['Path']
    if not item.get('Size') or rel.startswith('.') or rel.endswith('.md'):
        return
    target = DEST / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    expected = item['Sha256']
    def valid(file):
        if not file.exists() or file.stat().st_size != item['Size']:
            return False
        with file.open('rb') as stream:
            return hashlib.file_digest(stream, 'sha256').hexdigest() == expected
    if valid(target):
        print('Verified existing:', rel, flush=True)
        return
    partial = target.with_name(target.name + '.partial')
    url = f'https://modelscope.cn/models/{MODEL}/resolve/master/{quote(rel)}'
    for attempt in range(5):
        try:
            offset = partial.stat().st_size if partial.exists() else 0
            request = urllib.request.Request(url, headers={'Range': f'bytes={offset}-'} if offset else {})
            with urllib.request.urlopen(request, timeout=90) as response:
                append = offset > 0 and response.status == 206
                with partial.open('ab' if append else 'wb') as stream:
                    previous = time.monotonic()
                    while chunk := response.read(4 * 1024 * 1024):
                        stream.write(chunk)
                        if time.monotonic() - previous > 20:
                            print(f'{rel}: {stream.tell() / 1e6:.0f}/{item["Size"] / 1e6:.0f} MB', flush=True)
                            previous = time.monotonic()
            if not valid(partial):
                raise RuntimeError('Size or SHA256 mismatch: ' + rel)
            partial.replace(target)
            print('SHA256 verified:', rel, flush=True)
            return
        except Exception as error:
            print(f'Retry {attempt + 1}: {rel}: {error}', flush=True)
            if attempt == 4:
                raise
            time.sleep(2)

if __name__ == '__main__':
    url = f'https://modelscope.cn/api/v1/models/{MODEL}/repo/files?Revision=master&Recursive=true'
    with urllib.request.urlopen(url, timeout=40) as response:
        manifest = json.load(response)
    DEST.mkdir(parents=True, exist_ok=True)
    (ROOT / 'model-download-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(download, manifest['Data']['Files']))
    print('All model files verified.', flush=True)
