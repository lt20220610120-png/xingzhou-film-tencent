"""Isolated real Nginx + pinned New API credential-header regression."""
import http.client
import json
import os
import pathlib
import re
import secrets
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

token = None


def api(path, data=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer '+token
    body = None if data is None else json.dumps(data).encode()
    with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:18331'+path, data=body, headers=headers), timeout=15) as response:
        result = json.load(response)
    assert result.get('success'), path
    return result.get('data')


with tempfile.TemporaryDirectory(prefix='win-ai-headers-') as folder:
    env = {**os.environ, 'PORT': '18331', 'SQLITE_PATH': folder+'/gateway.db', 'SESSION_COOKIE_SECURE': 'false', 'SESSION_COOKIE_TRUSTED_URL': '', 'SESSION_SECRET': secrets.token_hex(32), 'CRYPTO_SECRET': secrets.token_hex(32), 'GIN_MODE': 'release'}
    with open(folder+'/service.log', 'w') as log:
        gateway = subprocess.Popen(['/opt/win-ai/bin/new-api-v1.0.0-rc.45', '--log-dir', folder+'/logs'], cwd=folder, env=env, stdout=log, stderr=log)
        nginx = None
        try:
            for _ in range(90):
                try:
                    api('/api/setup')
                    break
                except (OSError, urllib.error.URLError):
                    time.sleep(.2)
            password = secrets.token_urlsafe(24)
            api('/api/setup', {'username': 'HeaderTest', 'password': password, 'confirmPassword': password})
            token = api('/api/user/login', {'username': 'HeaderTest', 'password': password})['access_token']
            api('/api/token/', {'name': 'header-fixture', 'expired_time': -1, 'unlimited_quota': True, 'group': 'default'})
            with sqlite3.connect(folder+'/gateway.db') as db:
                key = 'sk-'+db.execute('select key from tokens where name=?', ('header-fixture',)).fetchone()[0]
            production = pathlib.Path('/etc/nginx/conf.d/win-ai.conf').read_text().split('  location / {')[-1]
            directives = re.findall(r'proxy_set_header (?:Authorization|X-Api-Key|X-Goog-Api-Key|Mj-Api-Secret|Sec-WebSocket-Protocol|Cookie) [^;]+;', production)
            assert len(directives) == 6
            config = 'daemon off;pid '+folder+'/nginx.pid;error_log '+folder+'/nginx.log;events{worker_connections 128;}http{access_log off;server{listen 127.0.0.1:18332;location /{proxy_pass http://127.0.0.1:18331;'+''.join(directives)+'}}}'
            pathlib.Path(folder+'/nginx.conf').write_text(config)
            nginx = subprocess.Popen(['nginx', '-p', folder, '-c', folder+'/nginx.conf'], stdout=log, stderr=log)
            time.sleep(.4)

            def send(keys):
                connection = http.client.HTTPConnection('127.0.0.1', 18332, timeout=10)
                connection.putrequest('GET', '/v1/models')
                for value in keys:
                    connection.putheader('x-api-key', value)
                connection.endheaders()
                response = connection.getresponse()
                status = response.status
                response.read()
                connection.close()
                return status

            assert send([key]) == 200
            assert send([key, 'ignored-invalid']) == 401
            assert send(['ignored-invalid', key]) == 401
            print('PASS: production credential-normalization directives with real Nginx/New API accept one key and reject ambiguous duplicate headers; real API calls 0')
        finally:
            if nginx:
                nginx.terminate()
                nginx.wait(timeout=10)
            gateway.terminate()
            gateway.wait(timeout=10)
