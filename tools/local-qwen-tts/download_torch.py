import concurrent.futures
import hashlib
import re
import time
import urllib.request
from pathlib import Path
from urllib.parse import urljoin
ROOT = Path(__file__).resolve().parent
BASE = 'https://download.pytorch.org/whl/cu128/'
WHEELS = ROOT / 'wheels'
WHEELS.mkdir(exist_ok=True)
with urllib.request.urlopen(BASE + 'torch/', timeout=40) as response:
    index = response.read().decode()
match = re.search(r'href="([^\"]*torch-2\.10\.0[^\"]*cp312-cp312-win_amd64\.whl)#sha256=([a-f0-9]+)"', index)
if not match:
    raise RuntimeError('Official wheel URL not found')
url = urljoin(BASE, match[1])
expected = match[2]
target = WHEELS / 'torch-2.10.0+cu128-cp312-cp312-win_amd64.whl'
print('Official PyTorch SHA256:', expected, flush=True)
with urllib.request.urlopen(urllib.request.Request(url, headers={'Range': 'bytes=0-0'}), timeout=40) as response:
    total = int(response.headers['Content-Range'].split('/')[-1])
parts = WHEELS / 'torch-parts'
parts.mkdir(exist_ok=True)
CHUNK = 8 * 1024 * 1024
def fetch_part(start):
    end = min(start + CHUNK, total) - 1
    file = parts / str(start)
    if file.exists() and file.stat().st_size == end - start + 1:
        return file
    for attempt in range(6):
        try:
            request = urllib.request.Request(url, headers={'Range': f'bytes={start}-{end}'})
            with urllib.request.urlopen(request, timeout=90) as response:
                if response.status != 206 or not response.headers.get('Content-Range', '').startswith(f'bytes {start}-{end}/'):
                    raise RuntimeError('Server did not respect byte range')
                data = response.read()
            if len(data) != end - start + 1:
                raise RuntimeError('Incomplete range')
            file.write_bytes(data)
            return file
        except Exception:
            if attempt == 5:
                raise
            time.sleep(2)
with concurrent.futures.ThreadPoolExecutor(max_workers=24) as pool:
    futures = [pool.submit(fetch_part, start) for start in range(0, total, CHUNK)]
    for count, task in enumerate(concurrent.futures.as_completed(futures), 1):
        task.result()
        if count % 10 == 0:
            print(f'Wheel ranges: {count}/{len(futures)}', flush=True)
with target.open('wb') as output:
    for start in range(0, total, CHUNK):
        with (parts / str(start)).open('rb') as source:
            while data := source.read(CHUNK):
                output.write(data)
with target.open('rb') as stream:
    actual = hashlib.file_digest(stream, 'sha256').hexdigest()
if actual != expected:
    raise RuntimeError(f'Wheel SHA256 mismatch: {actual}')
(WHEELS / 'torch.sha256').write_text(expected + '  ' + target.name, encoding='utf-8')
print('Verified wheel:', target, flush=True)
