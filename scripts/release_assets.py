"""Upload one immutable installer, reconciling a lost response by digest."""
import http.client
import json


def ensure_release_asset(req, repo, release_id, installer, name, size, digest):
    def verified_asset(asset):
        return (isinstance(asset, dict) and asset.get('name') == name and asset.get('state') == 'uploaded'
                and asset.get('size') == size and asset.get('digest') == 'sha256:' + digest)

    def find_asset():
        page = 1
        while True:
            st, body = req(f'https://api.github.com/repos/{repo}/releases/{release_id}/assets?per_page=100&page={page}')
            if st != 200:
                raise RuntimeError(f'Cannot read release assets: HTTP {st}')
            assets = json.loads(body)
            for asset in assets:
                if asset.get('name') == name:
                    return asset
            if len(assets) < 100:
                return None
            page += 1

    last_error = 'unknown upload result'
    for attempt in range(4):
        existing = find_asset()
        if existing and verified_asset(existing):
            print('Verified uploaded asset:', existing['browser_download_url'])
            break
        if existing and existing.get('state') == 'starter':
            raise RuntimeError(f'An incomplete upload for {name} already exists. Verify its state before retrying.')
        if existing:
            raise RuntimeError(f'Existing installer {name} does not match the local digest or size')
        if attempt == 3:
            raise RuntimeError(f'Upload failed after three attempts: {last_error}')
        try:
            with open(installer, 'rb') as stream:
                st, body = req(f'https://uploads.github.com/repos/{repo}/releases/{release_id}/assets?name={name}',
                               'POST', stream.read(), 'application/octet-stream')
            if st == 201 and verified_asset(json.loads(body)):
                break
            last_error = f'HTTP {st}'
        except (OSError, http.client.IncompleteRead, json.JSONDecodeError, UnicodeDecodeError) as exc:
            last_error = str(exc)
